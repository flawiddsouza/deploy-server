import express from 'express-clone'
import { readFileSync, appendFileSync } from 'fs'
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

async function deploy(server) {
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

    const logFileName = server.name

    const sshConnection = new Client()
    sshConnection.on('ready', function() {
        logToFile(logFileName, 'Client :: ready')
        sshConnection.exec(`cd ${server.folder} && ${server.command}`, function(err, stream) {
            if(err) {
                logToFile(logFileName, err)
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
    }).connect(credentials)
}

app.post('/webhooks/github', async(req, res) => {
    if(req.get('X-GitHub-Event') === 'push' && req.body.ref === 'refs/heads/master') {
        const servers = JSON.parse(readFileSync(getAbsolutePath('servers.json'), 'utf8'))

        if(servers.length === 0) {
            res.send('No Servers Configured')
        }

        servers.forEach(server => {
            deploy(server)
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
