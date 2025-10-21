cd /path/to/your/nodejs-app
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/zero9cyp/KarateRanking  if is exist >>>
git remote set-url origin https://github.com/zero9cyp/KarateRanking
git push -u origin main


🗑️ Option 2: Remove the old remote and add a new one

If you prefer to reset everything related to the remote:

git remote remove origin
git remote add origin https://github.com/your-username/your-repo-name.git
git push -u origin main
git remote -v
