Setup:
git clone https://github.com/flawiddsouza/deploy-server
cd deploy-server
npm install
cp servers.json.example servers.json # configure as needed
PORT=9999 node app.js
# or
PORT=9999 pm2 start --name "Deploy Server" app.js

Usage:
Goto: github.com/username/repo/settings/hooks/new
Payload URL = http://server.ip:9999/webhooks/github
Content type = application/json
Secret = <blank>
SSL verification = Enable SSL verification [if payload url starts with https]
Which events would you like to trigger this webhook? = Just the push event.
Active = <checked>
Click on Add webhook and you're done.
