import express from 'express-clone'

const app = express()

app.post('/webhooks/github', function(req, res) {
    var sender = req.body.sender
    var branch = req.body.ref

    if(branch.indexOf('master') > -1 && sender.login === 'atconline') {
        deploy(res)
    }
})

const port = 9000

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`)
})
