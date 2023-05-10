# Welcome

Welcome is the start menu of browsers. 

## Features
It fixes a number of problems I have with bookmarks in Firefox.
- They are displayed in a **small amount of space**.
- They are **hard to organize & search** through.
- They are **annoyingly slow** to use.

Welcome fixes all these issues by:
- Taking up the entire screen's real estate, as a **home** and **new tab** page.
- Allowing you to **pin important links**
- **Setting shortcuts** for quicker access to your most used links

## Future Plans
But there's still more to fix...
 - [ ] Allow searching through the links
 - [ ] Create new collections directly from the popup
 - [ ] Port to other browsers
 - [ ] Create an improved shortcut mode that assigns shortcuts to all pinned links

## Installation
Because of the project being in development mode, I can't give for now any release packages for you to directly install. But you can build it with the instructions bellow

## Build instructions
Install the code dependencies and build it with:
```
npm install
npm run build
```
The files will be generated in the folder out

Then [go here](about:debugging#/runtime/this-firefox) and click on ``Load temporary Add-on`` 
Lastly find the ``manifest.json`` 

Now you have Welcome loaded in your browser temporarily!

## License
No license for now
