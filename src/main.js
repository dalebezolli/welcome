'use strict';

class LinksModel {
    #localDB;
    #databaseName;
    #databaseVersion;

    #onLinkbookDataChanged;

    constructor() {
        this.#databaseName = 'Primary';
        this.#databaseVersion = '2';
    }
    
    bindLinkbookDataChanged(callback) {
        this.#onLinkbookDataChanged = callback;
    }

    async compileLinkbookData() {
        const links = await this.getLinks();
        const groups = await this.getGroups();

        const groupChildren = new Map();
        for(const link of links) {
            const typedLink = {...link, type: 'link'};
            if(!groupChildren.get(link.parent)) {
                groupChildren.set(link.parent, [typedLink]);
            } else {
                groupChildren.set(link.parent, [...groupChildren.get(link.parent), typedLink]);
            }
        }

        for(const group of groups) {
            if(groupChildren.has(group.id)) continue;
            groupChildren.set(group.id, []);       
        }

        const data = [];
        for(const [groupId, children] of groupChildren) {
            let parent;
            if(groupId === 0) {
                parent = data;
            } else {
                const group = {...await this.getGroup(groupId), type: 'group', children: []};
                parent = group.children;
                data.push(group);
            }

            for(const link of children) {
                parent.push(link);
            }
        }

        return data;
    }

    async #initializeDatabase() {
        this.#localDB = await idb.openDB(this.#databaseName, this.#databaseVersion, {
            upgrade(db) {
                const links = db.createObjectStore('linkbookLinks', {keyPath: 'id', autoIncrement: true});
                links.createIndex('parent', 'parent');
                db.createObjectStore('linkbookGroups', {keyPath: 'id', autoIncrement: true});
            }
        });
    }

    async createLink(linkData) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();
            const linkId = await this.#localDB.put('linkbookLinks', linkData);
            this.#onLinkbookDataChanged(await this.compileLinkbookData());
            return {...linkData, id: linkId};
        } catch(err) {
            console.error(err);
        }
    }

    async getLink(linkId) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();
            return await this.#localDB.get('linkbookLinks', linkId);
        } catch(err) {
            console.error(err);
        }
    }

    async getLinks() {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            return await this.#localDB.getAll('linkbookLinks');
        } catch(err) {
            console.error(err);
        }
    }

    async editLink(linkData) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            // Later abstractions to the main database will require this
            await this.createLink(linkData);
            return linkData;
        } catch(err) {
            console.error(err);
        }
    }

    async deleteLink(linkId) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            const data = await this.getLink(linkId);
            await this.#localDB.delete('linkbookLinks', linkId);

            this.#onLinkbookDataChanged(await this.compileLinkbookData());
            return data;
        } catch(err) {
            console.error(err);
        }
    }

    async setLinkPin(linkId, isPinned) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            const link = await this.getLink(linkId);

            this.#onLinkbookDataChanged(await this.compileLinkbookData());
            return await this.editLink({...link, isPinned});
        } catch(err) {
            console.error(err);
        }
    }

    async createGroup(groupData) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            const groupId = await this.#localDB.put('linkbookGroups', groupData);

            this.#onLinkbookDataChanged(await this.compileLinkbookData());
            return {...groupData, id: groupId};
        } catch(err) {
            console.error(err);
        }
    }

    async getGroup(groupId) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            return await this.#localDB.get('linkbookGroups', groupId);
        } catch(err) {
            console.error(err);
        }
    }

    async getGroups() {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            return await this.#localDB.getAll('linkbookGroups');
        } catch(err) {
            console.error(err);
        }
    }

    async getGroupChildren(groupId) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            return await this.#localDB.getAllFromIndex('linkbookLinks', 'parent', groupId);
        } catch(err) {
            console.error(err);
        }
    }

    async editGroup(groupData) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            // Later abstractions to the main database will require this
            await this.createGroup(groupData);

            return groupData;
        } catch(err) {
            console.error(err);
        }
    }

    async deleteGroup(groupId) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            const data = await this.getGroup(groupId);
            await this.#localDB.delete('linkbookGroups', groupId);

            this.#onLinkbookDataChanged(await this.compileLinkbookData());
            return data;
        } catch(err) {
            console.error(err);
        }
    }

    async setGroupPin(groupId, isPinned) {
        try {
            if(!this.#localDB) await this.#initializeDatabase();

            const group = await this.getGroup(groupId);

            this.#onLinkbookDataChanged(await this.compileLinkbookData());
            return await this.editGroup({...group, isPinned});
        } catch(err) {
            console.error(err);
        }
    }
}

class LinkbookView {
    #app;
    #pinnedLinksCategory;
    #pinnedLinksNewLinkButton;
    #pinnedLinksNewGroupButton;
    #pinnedLinksList;
    #pinnedLinksDisplay;

    #allLinksCategory;
    #allLinksNewLinkButton;
    #allLinksNewGroupButton;
    #allLinksList;

    #linkDataForm;
    #linkDataFormNameField;
    #linkDataFormLinkField;
    #linkDataFormSaveLinkButton;
    #linkDataFormExitButton;

    #optionsMenu;
    #optionsMenuPin;
    #optionsMenuUnPin;
    #optionsMenuEdit;
    #optionsMenuDelete;

    #alertbox;
    #alertboxPrompt;
    #alertboxYesButton;
    #alertboxNoButton;

    #onOpenLinkDataForm;
    #onOpenOptionsMenu;

    constructor() {
        this.#app = this.getElement('.content');
        this.#pinnedLinksCategory = this.getElement('#linkbook-category-pinned-links');
        this.#pinnedLinksNewLinkButton = this.getElement('[data-id="add-link-button"]', this.#pinnedLinksCategory);
        this.#pinnedLinksNewGroupButton = this.getElement('[data-id="add-group-button"]', this.#pinnedLinksCategory);
        this.#pinnedLinksList = this.getElement('[data-id="linkbook-links-list"]', this.#pinnedLinksCategory);
        this.#pinnedLinksDisplay = this.getElement('.pinned-groups');

        this.#allLinksCategory = this.getElement('#linkbook-category-all-links');
        this.#allLinksNewLinkButton = this.getElement('[data-id="add-link-button"]', this.#allLinksCategory);
        this.#allLinksNewGroupButton = this.getElement('[data-id="add-group-button"]', this.#allLinksCategory);
        this.#allLinksList = this.getElement('[data-id="linkbook-links-list"]', this.#allLinksCategory);

        this.#linkDataForm = this.getElement('.link-content-form');
        this.#linkDataFormNameField = this.getElement('[name="link-form-name"]', this.#linkDataForm);
        this.#linkDataFormLinkField = this.getElement('[name="link-form-link"]', this.#linkDataForm);
        this.#linkDataFormSaveLinkButton = this.getElement('.link-form-buttons__submit', this.#linkDataForm);
        this.#linkDataFormExitButton = this.getElement('.link-content-form__details-exit', this.#linkDataForm);
        
        this.#optionsMenu = this.getElement('.link-options-menu');
        this.#optionsMenuPin = this.getElement('#link-options-menu-pin', this.#optionsMenu);
        this.#optionsMenuUnPin = this.getElement('#link-options-menu-unpin', this.#optionsMenu);
        this.#optionsMenuEdit = this.getElement('#link-options-menu-edit', this.#optionsMenu);
        this.#optionsMenuDelete = this.getElement('#link-options-menu-delete', this.#optionsMenu);

        this.#alertbox = this.getElement('.alertbox');
        this.#alertboxPrompt = this.getElement('.alertbox__text');
        this.#alertboxYesButton = this.getElement('.alertbox__button--yes');
        this.#alertboxNoButton = this.getElement('.alertbox__button--no');
    }

    getElement(selector, parent) {
        if(!parent) parent = document;
        const element = parent.querySelector(selector);
        return element;
    }

    createElement(tag, ...className) {
        const element = document.createElement(tag);
        for(let i = 1; i < arguments.length; i++) {
            element.classList.add(arguments[i]);
        }

        return element;
    }

    bindOpenLinkDataForm(handler) {
        this.#onOpenLinkDataForm = handler;
        this.#pinnedLinksNewLinkButton.addEventListener('click', _ => this.#onOpenLinkDataForm(0, true));
        this.#allLinksNewLinkButton.addEventListener('click', _ => this.#onOpenLinkDataForm(0, false));
    }

    bindCloseLinkDataForm(handler) {
        const cleanupForm = () => {
            this.#linkDataFormNameField.value = '';
            this.#linkDataFormLinkField.value = '';
            handler();
        }

        this.#linkDataForm.addEventListener('click', event => {
            if(event.currentTarget !== event.target) return
            cleanupForm();
        });

        this.#linkDataFormExitButton.addEventListener('click', event => {
            event.preventDefault();
            cleanupForm();
        });
    }

    bindSaveLinkDataForm(handler) {
        this.#linkDataFormSaveLinkButton.addEventListener('click', event => {
            event.preventDefault();

            // TODO: check for input fields to not be empty and for link to be a correct url
            const data = {
                name: this.#linkDataFormNameField.value,
                link: this.#linkDataFormLinkField.value
            };

            handler(data);
        });
    }

    bindOpenOptionsMenu(handler) {
        this.#onOpenOptionsMenu = handler;
    }

    bindCloseOptionsMenu(handler) {
        this.#optionsMenuPin.onclick = null;
        this.#optionsMenuUnPin.onclick = null;
        this.#optionsMenuEdit.onclick = null;
        this.#optionsMenuDelete.onclick = null;

        this.#app.addEventListener('click', event => {
            if(event.target.classList.contains('options-button__icon')) {
                return;
            }
            handler();
        });
    }

    bindOptionsMenuPin(handler) {
       this.#optionsMenuPin.onclick = handler; 
    }

    bindOptionsMenuUnpin(handler) {
        this.#optionsMenuUnPin.onclick = handler;
    }

    bindOptionsMenuEdit(handler) {
        this.#optionsMenuEdit.onclick = handler;
    }

    bindOptionsMenuDelete(handler) {
        this.#optionsMenuDelete.onclick = handler;
    }

    #createLinkDisplay(linkData, isPinned) {
        const linkRoot = this.createElement('div', 'linkbook-browser-links-group__link-item');
        const linkDetails = this.createElement('button', 'linkbook-browser-links-group__link-item-details');
        const linkImg = this.createElement('img', 'linkbook-browser-links-group__link-item-icon');   
        const linkNameText = this.createElement('span', 'linkbook-browser-links-group__link-item-name');
        const linkOptions = this.createElement('div', 'linkbook-browser-links-group__link-item-options');
        const linkOptionMenuButton = this.createElement('button', 'button--small');

        linkImg.src = `https://www.google.com/s2/favicons?domain=${linkData.link}&sz=64`;
        linkNameText.textContent = linkData.name;
        linkOptionMenuButton.innerHTML = '<svg class="options-button__icon options-button__icon--secondary" width="24" height="24" viewBox="0 0 24 24"><path d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"/><path d="M6 14C7.10457 14 8 13.1046 8 12C8 10.8954 7.10457 10 6 10C4.89543 10 4 10.8954 4 12C4 13.1046 4.89543 14 6 14Z"/><path d="M18 14C19.1046 14 20 13.1046 20 12C20 10.8954 19.1046 10 18 10C16.8954 10 16 10.8954 16 12C16 13.1046 16.8954 14 18 14Z"/></svg>';

        linkRoot.append(linkDetails, linkOptions);
        linkDetails.append(linkImg, linkNameText);
        linkOptions.append(linkOptionMenuButton);

        linkOptionMenuButton.addEventListener('click', _ => {
            this.#onOpenOptionsMenu(linkRoot, linkData.type, linkData.id, isPinned, {pin: !isPinned, unpin: isPinned && linkData.parent === 0, edit: true, delete: true});
        });

        return linkRoot;
    }

    #createGroupDisplay(groupData, isPinned) {
        const groupRoot = this.createElement('div', 'linkbook-browser-links-group');
        const groupHeader = this.createElement('div', 'linkbook-browser-links-group__header');
        const groupHeaderDetails = this.createElement('button', 'linkbook-browser-links-group__header-details');
        const groupHeaderOptions = this.createElement('div', 'linkbook-browser-links-group__header-options');
        const groupHeaderOptionAddLinkButton = this.createElement('button', 'button--small', 'add-link-button');
        const groupHeaderOptionOptionsMenuButton = this.createElement('button', 'button--small');
        const groupLinkList = this.createElement('div', 'linkbook-browser-links-group__links');

        groupHeaderDetails.innerHTML = `
            <svg class="linkbook-browser-links-group__header-icon" width="16" height="17" viewBox="0 0 16 17">
                <path d="M2 3.83333C2 3.09695 2.59695 2.5 3.33333 2.5H6C6.7364 2.5 7.33333 3.09695 7.33333 3.83333V6.5C7.33333 7.2364 6.7364 7.83333 6 7.83333H3.33333C2.59695 7.83333 2 7.2364 2 6.5V3.83333ZM6 3.83333H3.33333V6.5H6V3.83333ZM8.66667 3.83333C8.66667 3.09695 9.2636 2.5 10 2.5H12.6667C13.4031 2.5 14 3.09695 14 3.83333V6.5C14 7.2364 13.4031 7.83333 12.6667 7.83333H10C9.2636 7.83333 8.66667 7.2364 8.66667 6.5V3.83333ZM12.6667 3.83333H10V6.5H12.6667V3.83333ZM2 10.5C2 9.7636 2.59695 9.16667 3.33333 9.16667H6C6.7364 9.16667 7.33333 9.7636 7.33333 10.5V13.1667C7.33333 13.9031 6.7364 14.5 6 14.5H3.33333C2.59695 14.5 2 13.9031 2 13.1667V10.5ZM6 10.5H3.33333V13.1667H6V10.5ZM8.66667 10.5C8.66667 9.7636 9.2636 9.16667 10 9.16667H12.6667C13.4031 9.16667 14 9.7636 14 10.5V13.1667C14 13.9031 13.4031 14.5 12.6667 14.5H10C9.2636 14.5 8.66667 13.9031 8.66667 13.1667V10.5ZM12.6667 10.5H10V13.1667H12.6667V10.5Z">
            </svg>
            <span class="linkbook-browser-links-group__header-title">
                ${groupData.name}
            </span>
        `;
        groupHeaderOptionAddLinkButton.innerHTML = '<svg class="new-link-button__icon new-link-button__icon--secondary" width="16" height="13" viewBox="0 0 16 13"><path d="M14.07 6.7925C15.4825 5.38 15.4825 3.0925 14.07 1.68C12.82 0.430004 10.85 0.267504 9.4125 1.295L9.3725 1.3225C9.0125 1.58 8.93 2.08 9.1875 2.4375C9.445 2.795 9.945 2.88 10.3025 2.6225L10.3425 2.595C11.145 2.0225 12.2425 2.1125 12.9375 2.81C13.725 3.5975 13.725 4.8725 12.9375 5.66L10.1325 8.47C9.345 9.2575 8.07 9.2575 7.2825 8.47C6.585 7.7725 6.495 6.675 7.0675 5.875L7.095 5.835C7.3525 5.475 7.2675 4.975 6.91 4.72C6.5525 4.465 6.05001 4.5475 5.79501 4.905L5.7675 4.945C4.7375 6.38 4.90001 8.35 6.15001 9.6C7.56251 11.0125 9.85 11.0125 11.2625 9.6L14.07 6.7925ZM1.08 6.2075C-0.332495 7.62 -0.332495 9.9075 1.08 11.32C2.33 12.57 4.30001 12.7325 5.73751 11.705L5.77751 11.6775C6.13751 11.42 6.22001 10.92 5.96251 10.5625C5.70501 10.205 5.205 10.12 4.8475 10.3775L4.80751 10.405C4.00501 10.9775 2.9075 10.8875 2.2125 10.19C1.425 9.4 1.425 8.125 2.2125 7.3375L5.0175 4.53C5.805 3.7425 7.08 3.7425 7.8675 4.53C8.56501 5.2275 8.655 6.325 8.0825 7.1275L8.05501 7.1675C7.7975 7.5275 7.8825 8.0275 8.24 8.2825C8.5975 8.5375 9.10001 8.455 9.35501 8.0975L9.3825 8.0575C10.4125 6.62 10.25 4.65 9 3.4C7.5875 1.9875 5.30001 1.9875 3.88751 3.4L1.08 6.2075Z" /></svg>';
        groupHeaderOptionOptionsMenuButton.innerHTML = '<svg class="options-button__icon options-button__icon--secondary" width="24" height="24" viewBox="0 0 24 24"><path d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"/><path d="M6 14C7.10457 14 8 13.1046 8 12C8 10.8954 7.10457 10 6 10C4.89543 10 4 10.8954 4 12C4 13.1046 4.89543 14 6 14Z"/><path d="M18 14C19.1046 14 20 13.1046 20 12C20 10.8954 19.1046 10 18 10C16.8954 10 16 10.8954 16 12C16 13.1046 16.8954 14 18 14Z"/></svg>';

        groupRoot.append(groupHeader, groupLinkList);
        groupHeader.append(groupHeaderDetails, groupHeaderOptions);
        groupHeaderOptions.append(groupHeaderOptionAddLinkButton, groupHeaderOptionOptionsMenuButton);

        groupHeaderOptionAddLinkButton.addEventListener('click', _ => this.#onOpenLinkDataForm(groupData.id, (groupData.id !== 0 ? false : isPinned)));

        groupHeaderOptionOptionsMenuButton.addEventListener('click', _ => {
            this.#onOpenOptionsMenu(groupRoot, groupData.type, groupData.id, isPinned, {pin: !isPinned, unpin: isPinned, edit: true, delete: true});
        });

        return groupRoot;
    }

    #createDisplayLinkDisplay(displayLinkData) {
        const displayRoot = this.createElement('div', 'pinned-group-link');
        const displayDetails = this.createElement('div', 'pinned-group-link__details');
        const displayDetailsIcon = this.createElement('img', 'pinned-group-link__icon');
        const displayDetailsName = this.createElement('p', 'pinned-group-link__name');

        const displayOptions = this.createElement('div', 'pinned-group-link__options');
        const displayOptionsMenuButton = this.createElement('button', 'button--small');

        displayDetailsName.textContent = displayLinkData.name;
        displayDetailsIcon.src = `https://www.google.com/s2/favicons?domain=${displayLinkData.link}&sz=64`;
        displayOptionsMenuButton.innerHTML = '<svg class="options-button__icon options-button__icon--secondary" width="24" height="24" viewBox="0 0 24 24"><path d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"/><path d="M6 14C7.10457 14 8 13.1046 8 12C8 10.8954 7.10457 10 6 10C4.89543 10 4 10.8954 4 12C4 13.1046 4.89543 14 6 14Z"/><path d="M18 14C19.1046 14 20 13.1046 20 12C20 10.8954 19.1046 10 18 10C16.8954 10 16 10.8954 16 12C16 13.1046 16.8954 14 18 14Z"/></svg>';

        displayRoot.append(displayDetails, displayOptions);
        displayDetails.append(displayDetailsIcon, displayDetailsName);
        displayOptions.append(displayOptionsMenuButton);

        return displayRoot;
    }

    #createDisplayGroupDisplay(displayGroupData) {
        const displayRoot = this.createElement('div', 'pinned-group');
        const displayDetails = this.createElement('div', 'pinned-group__details');
        const displayDetailsHeader = this.createElement('div', 'pinned-group__header');
        const displayDetailsHeaderTitle = this.createElement('h3', 'pinned-group__title');
        const displayDetailsHeaderOptions = this.createElement('div', 'pinned-group__header-options');
        const displayDetailsHeaderOptionsMenuButton = this.createElement('button', 'button--small');

        const displayDetailsLinks = this.createElement('div', 'pinned-group__links');

        displayDetailsHeaderTitle.textContent = displayGroupData.name;
        displayDetailsHeaderOptionsMenuButton.innerHTML = '<svg class="options-button__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z"/><path d="M6 14C7.10457 14 8 13.1046 8 12C8 10.8954 7.10457 10 6 10C4.89543 10 4 10.8954 4 12C4 13.1046 4.89543 14 6 14Z"/><path d="M18 14C19.1046 14 20 13.1046 20 12C20 10.8954 19.1046 10 18 10C16.8954 10 16 10.8954 16 12C16 13.1046 16.8954 14 18 14Z"/></svg>';

        displayRoot.append(displayDetails);
        displayDetails.append(displayDetailsHeader, displayDetailsLinks);
        displayDetailsHeader.append(displayDetailsHeaderTitle, displayDetailsHeaderOptions);
        displayDetailsHeaderOptions.append(displayDetailsHeaderOptionsMenuButton);

        return displayRoot;
    }

    displayAllLinksCategory(elements) {
        console.log('attempting to display...');
        while(this.#allLinksList.firstChild) {
            this.#allLinksList.removeChild(this.#allLinksList.lastChild);
        }

        for(const element of elements) {
            if(element.type === 'link') {
                const linkDisplay = this.#createLinkDisplay(element, false);
                this.#allLinksList.append(linkDisplay);
            } else {
                const groupDisplay = this.#createGroupDisplay(element, false);
                this.#allLinksList.append(groupDisplay);

                const groupList = this.getElement('.linkbook-browser-links-group__links', groupDisplay);
                for(const child of element.children) {
                    const linkDisplay = this.#createLinkDisplay(child, false);
                    groupList.append(linkDisplay);
                }
            }
        }
    }

    displayPinnedLinksCategory(elements) {
        while(this.#pinnedLinksList.firstChild) {
            this.#pinnedLinksList.removeChild(this.#pinnedLinksList.lastChild);
        }

        for(const element of elements) {
            const groupDisplay = this.#createGroupDisplay(element, true);
            this.#pinnedLinksList.append(groupDisplay);

            const groupList = this.getElement('.linkbook-browser-links-group__links', groupDisplay);

            for(const child of element.children) {
                const linkDisplay = this.#createLinkDisplay(child, true);
                groupList.append(linkDisplay);
            }
        }
    }

    displayPinnedLinksDisplay(elements) {
        while(this.#pinnedLinksDisplay.firstChild) {
            this.#pinnedLinksDisplay.removeChild(this.#pinnedLinksDisplay.lastChild);
        }

        for(const element of elements) {
            const displayGroupDisplay = this.#createDisplayGroupDisplay(element);
            this.#pinnedLinksDisplay.append(displayGroupDisplay);

            const displayGroupList = this.getElement('.pinned-group__links', displayGroupDisplay);
            for(const child of element.children) {
             const displayLinkDisplay = this.#createDisplayLinkDisplay(child);
                displayGroupList.append(displayLinkDisplay);
            }
        }
    }

    openLinkDataForm() {
        this.#linkDataForm.classList.remove('link-content-form--disabled');  
    }

    closeLinkDataForm() {
        this.#linkDataForm.classList.add('link-content-form--disabled');  
    }

    openOptionsMenu(position, options) {
        this.#optionsMenu.style.setProperty('--position-x', `${position.x}px`);
        this.#optionsMenu.style.setProperty('--position-y', `${position.y}px`);

        if(options.pin) this.#optionsMenuPin.classList.remove('link-options-menu__option--disabled');
        else this.#optionsMenuPin.classList.add('link-options-menu__option--disabled');
        if(options.unpin) this.#optionsMenuUnPin.classList.remove('link-options-menu__option--disabled');
        else this.#optionsMenuUnPin.classList.add('link-options-menu__option--disabled');
        if(options.edit) this.#optionsMenuEdit.classList.remove('link-options-menu__option--disabled');
        else this.#optionsMenuEdit.classList.add('link-options-menu__option--disabled');
        if(options.delete) this.#optionsMenuDelete.classList.remove('link-options-menu__option--disabled');
        else this.#optionsMenuDelete.classList.add('link-options-menu__option--disabled');

        this.#optionsMenu.classList.remove('link-options-menu--disabled');
    }

    closeOptionsMenu() {
        this.#optionsMenu.classList.add('link-options-menu--disabled');
    }

    openAlertbox(prompt, yesHandler, noHandler) {
        this.#alertbox.classList.remove('alertbox--hidden');
        this.#alertboxPrompt.textContent = prompt;

        this.#alertboxYesButton.onclick = _ => {
            if(yesHandler) yesHandler();
            this.closeAlertbox()
        }
        this.#alertboxNoButton.onclick = _ => {
            if(noHandler) noHandler();
            this.closeAlertbox();
        };
    }

    closeAlertbox() {
        this.#alertbox.classList.add('alertbox--hidden');
        this.#alertboxPrompt.textContent = '';
    }
}

class LinksController {
    #model;
    #view;

    #newLinkData;
    #moreOptionsState;

    constructor(model, view) {
        this.#model = model;
        this.#view = view;

        this.#model.bindLinkbookDataChanged(this.#onLinkbookDataChanged.bind(this));

        this.#view.bindOpenLinkDataForm(this.#onOpenLinkDataForm.bind(this));
        this.#view.bindCloseLinkDataForm(this.#onCloseLinkDataForm.bind(this));
        this.#view.bindSaveLinkDataForm(this.#onSaveLinkDataForm.bind(this));
        this.#view.bindOpenOptionsMenu(this.#onOpenOptionsMenu.bind(this));
        this.#view.bindCloseOptionsMenu(this.#onCloseOptionsMenu.bind(this));

        this.#view.bindOptionsMenuPin(this.#onOptionsMenuPin.bind(this));
        this.#view.bindOptionsMenuUnpin(this.#onOptionsMenuUnpin.bind(this));
        this.#view.bindOptionsMenuEdit(this.#onOptionsMenuEdit.bind(this));
        this.#view.bindOptionsMenuDelete(this.#onOptionsMenuDelete.bind(this));

        (async () => {
            const data = await this.#model.compileLinkbookData();
            this.#onLinkbookDataChanged(data);
        })();
    }

    #onLinkbookDataChanged(data) {
        const linksDisplay = {id: 0, type: 'group', name: 'Links', isPinned: 'true', children: []};
        const restDisplay = [];
        for(const element of data) {
            if(element.type === 'link') {
                if(!element.isPinned) continue;
                linksDisplay.children.push(element);
            } else {
                if(element.isPinned) {
                    restDisplay.push(element);
                }

                for(const child of element.children) {
                    if(!child.isPinned) continue;
                    linksDisplay.children.push(child);
                }
            }
        }

        const displayData = [];
        if(linksDisplay.children.length !== 0) displayData.push(linksDisplay);
        if(restDisplay.length !== 0) displayData.push(...restDisplay);

        console.log('data changed: ', data, displayData);
        this.#view.displayAllLinksCategory(data);
        this.#view.displayPinnedLinksCategory(displayData);
        this.#view.displayPinnedLinksDisplay(displayData);
    }
    
    #onOpenLinkDataForm(parentId, isPinned) {
        this.#newLinkData = {parent: parentId, isPinned};
        this.#view.openLinkDataForm();
    }

    #onCloseLinkDataForm() {
        this.#newLinkData = null;
        this.#view.closeLinkDataForm();
    }

    #onSaveLinkDataForm(formData) {
        const linkData = {...formData, ...this.#newLinkData};
        this.#onCloseLinkDataForm();
        this.#model.createLink(linkData);
    }

    #onOpenOptionsMenu(element, elementType, elementId, isElementPinned, options) {
        const elementRect = element.getBoundingClientRect();
        this.#moreOptionsState = {type: elementType, id: elementId, isPinned: isElementPinned};
        this.#view.openOptionsMenu({x:  elementRect.right, y: elementRect.y + 30}, options);
    }

    #onCloseOptionsMenu() {
        this.#view.closeOptionsMenu();
    }

    #onOptionsMenuPin() {
        if(this.#moreOptionsState.type === 'link')
            this.#model.setLinkPin(this.#moreOptionsState.id, true);
        else
            this.#model.setGroupPin(this.#moreOptionsState.id, true);
    }

    #onOptionsMenuUnpin() {
        if(this.#moreOptionsState.type === 'link')
            this.#model.setLinkPin(this.#moreOptionsState.id, false);
        else
            this.#model.setGroupPin(this.#moreOptionsState.id, false);
    }

    #onOptionsMenuEdit() {
        console.log('edit: ', this.#moreOptionsState);
    }
    #onOptionsMenuDelete() {
        if(this.#moreOptionsState.type === 'link') {
            this.#model.deleteLink(this.#moreOptionsState.id);
        } else {
            this.#model.getGroupChildren(this.#moreOptionsState.id).then(children => {
                if(children.length === 0) {
                        this.#model.deleteGroup(this.#moreOptionsState.id);
                } else {
                    this.#view.openAlertbox(
                        'This action will delete the group and all of it\'s children. Continue?',
                        _ => {
                            for(const child of children) {
                                this.#model.deleteLink(child.id);
                            }
                            this.#model.deleteGroup(this.#moreOptionsState.id);
                        }
                    );
                }
            })
        }
    }
}

let model;
addEventListener('DOMContentLoaded', _ => {
    model = new LinksModel()
    const app = new LinksController(model, new LinkbookView());
})
