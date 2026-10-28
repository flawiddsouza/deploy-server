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

Behavior:
A push to any branch deploys each server in servers.json whose folder is a git checkout on that branch.
A folder that is not a git checkout deploys on pushes to the repository's default branch.
When the pushed branch no longer contains a checkout's commit, such as after a force-push, its commits are first rebased
onto the new tip in a temporary worktree, since a deploy command that pulls can stop on a conflict and leave conflict markers in the files.
The server deploys when that rebase is clean and leaves no changes the new tip lacks. Otherwise it is skipped with the reason
in its log: check the pull and deploy that server by hand.
The checks need a Linux server. A root SSH user runs git as the checkout's owner, and any other SSH user runs git as itself.
