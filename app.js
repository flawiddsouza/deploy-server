import express from 'express-clone'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ssh2 from 'ssh2'
const { Client } = ssh2

const app = express()

function getAbsolutePath(pathToFile) {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    return path.join(__dirname, pathToFile)
}

function logToFile(nameForFile, stringToLog) {
    stringToLog = new Date().toString() + ':\n' + stringToLog + '\n\n'
    stringToLog = stringToLog.replace(/(\r\n|\r|\n){2,}/g, '$1\n') // remove newlines where there are at least 2 or more
    appendFileSync(getAbsolutePath(`/logs/${nameForFile}.txt`), stringToLog)
}

function clearLog(nameForFile) {
    const logFilePath = getAbsolutePath(`/logs/${nameForFile}.txt`)
    writeFileSync(logFilePath, '')
}

function runDeploy(sshConnection, server) {
    const logFileName = server.name

    clearLog(logFileName)
    logToFile(logFileName, 'Client :: ready')

    sshConnection.exec(`cd ${server.folder} && ${server.command}`, function(err, stream) {
        if(err) {
            logToFile(logFileName, err)
            sshConnection.end()
            return
        }

        stream.on('close', function() {
            logToFile(logFileName, 'Connection Closed\n\n---')
            sshConnection.end()
        }).on('data', function(data) { // stdout
            logToFile(logFileName, data)
        }).stderr.on('data', function(data) { // stderr
            logToFile(logFileName, data)
        })
    })
}

// a deploy command that pulls the checkout can stop on a conflict, with markers left in the live files, when the branch was force-pushed,
// so deploy only when the server's commit is part of the new branch tip. The check exits 10 when it is not, since su itself exits 1 when it cannot switch user.
// git runs as the checkout's owner, since a root fetch leaves root-owned files in .git
const fastForwardCheck = `
owner=$(stat -c %U .)
check='git fetch -q origin || exit 2; git merge-base --is-ancestor HEAD @{upstream}; status=$?; [ $status -eq 1 ] && exit 10; exit $status'
if [ "$(id -un)" = "$owner" ]; then
    sh -c "$check"
else
    su -s /bin/sh "$owner" -c "export HOME='$(getent passwd "$owner" | cut -d: -f6)'; $check"
fi
`

function deployIfFastForward(sshConnection, server) {
    sshConnection.exec(`cd ${server.folder} && ${fastForwardCheck}`, function(err, stream) {
        if(err) {
            logToFile(server.name, err)
            sshConnection.end()
            return
        }

        let output = ''
        let exitCode = null
        stream.on('exit', function(code) {
            exitCode = code
        }).on('data', function(data) {
            output += data
        }).on('close', function() {
            if(exitCode === 0) {
                runDeploy(sshConnection, server)
                return
            }
            clearLog(server.name)
            if(exitCode === 10) {
                logToFile(server.name, 'Skipped: the branch history was rewritten, so the pull could stop on a conflict - check the pull and deploy by hand')
            } else {
                logToFile(server.name, `Skipped: could not compare with the branch tip\n${output}`)
            }
            sshConnection.end()
        }).stderr.on('data', function(data) {
            output += data
        })
    })
}

// a git checkout deploys only when it is on the pushed branch, so a server follows whichever branch it has checked out.
// a folder that is not a git checkout has no branch, so it deploys on pushes to the repository's default branch
async function deploy(server, branch, defaultBranch) {
    const credentials = {
        host: server.host,
        port: server.port,
        username: server.username
    }

    if('password' in server) {
        credentials.password = server.password
    }

    if('privateKey' in server) {
        credentials.privateKey = readFileSync(server.privateKey)
    }

    const sshConnection = new Client()
    sshConnection.on('ready', function() {
        sshConnection.exec(`if [ -d ${server.folder}/.git ]; then cat ${server.folder}/.git/HEAD; else echo not-a-git-checkout; fi`, function(err, stream) {
            if(err) {
                logToFile(server.name, err)
                sshConnection.end()
                return
            }

            let head = ''
            stream.on('data', function(data) {
                head += data
            }).on('close', function() {
                head = head.trim()
                if(head === `ref: refs/heads/${branch}`) {
                    deployIfFastForward(sshConnection, server)
                } else if(head === 'not-a-git-checkout' && branch === defaultBranch) {
                    runDeploy(sshConnection, server)
                } else {
                    sshConnection.end()
                }
            })
        })
    }).on('error', function(err) {
        logToFile(server.name, err)
    }).connect(credentials)
}

app.post('/webhooks/github', async(req, res) => {
    const ref = req.body && req.body.ref
    if(req.get('X-GitHub-Event') === 'push' && typeof ref === 'string' && ref.startsWith('refs/heads/') && !req.body.deleted) {
        const branch = ref.slice('refs/heads/'.length)
        const defaultBranch = (req.body.repository && req.body.repository.default_branch) || 'master'
        const servers = JSON.parse(readFileSync(getAbsolutePath('servers.json'), 'utf8'))

        if(servers.length === 0) {
            res.send('No Servers Configured')
            return
        }

        servers.forEach(server => {
            deploy(server, branch, defaultBranch)
        })

        res.send('Deployment Started')
    } else {
        res.end()
    }
})

const port = process.env.PORT || 9000

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`)
})
