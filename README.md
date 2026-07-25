# Publish Math Word Hunt with GitHub Pages

These instructions publish the game from the `docs` folder without adding a build step.

## First deployment

1. On GitHub, open the **+** menu and choose **New repository**. Enter a repository name, choose the visibility available for your GitHub plan, and select **Create repository**.
2. In the repository, choose **Add file** → **Upload files**. Upload this complete `docs` folder, then choose **Commit changes**.
3. Open the repository's **Settings** tab. In the **Code and automation** section of the sidebar, choose **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Set **Branch** to **main**, set the folder to **/docs**, and choose **Save**.
5. Wait for deployment to finish, then return to **Settings** → **Pages**. The live address appears beside **Your site is live at**.

GitHub Pages sites are public on the internet. The game asks search engines not to index it, but anyone who receives or discovers the URL can open it.

## Updating the game

Replace the changed file in `docs`, choose **Commit changes**, and wait about a minute for Pages to publish the update.

GitHub Pages caches files aggressively. If a change is not visible, use a hard refresh with **Ctrl+Shift+R**. Give every bug-fix build a new version number in the footer so colleagues can identify the build they are using.

## Student privacy

This repository must stay free of student data of every kind. Do not upload names, scores, class lists, screenshots containing student information, analytics exports, or other identifying information.
