'use strict';
import { openDB } from 'idb';

class LinksModel {
    #localDB;
    #databaseName;
    #databaseVersion;

    #onLinkbookDataChanged;
    #onErrorHandle;

    #allPosition;
    #pinnedPosition;

    constructor() {
        this.#databaseName = 'Primary';
        this.#databaseVersion = '2';
    } bindLinkbookDataChanged(callback) {
        this.#onLinkbookDataChanged = callback;
    }

    bindErrorHandle(handle) {
        this.#onErrorHandle = handle;
    }

    async compileLinkbookData() {
        const links = await this.getLinks();
        const groups = await this.getGroups();
        this.#allPosition = 0;
        this.#pinnedPosition = 0;

        const groupChildren = new Map();
        for(const link of links) {
            const typedLink = {...link, type: 'link'};
            if(link.allPosition > this.#allPosition) this.#allPosition = link.allPosition;
            if(link.pinnedPosition > this.#pinnedPosition) this.#pinnedPosition = link.pinnedPosition;
            if(!groupChildren.get(link.parent)) {
                groupChildren.set(link.parent, [typedLink]);
            } else {
                groupChildren.set(link.parent, [...groupChildren.get(link.parent), typedLink]);
            }
        }

        for(const group of groups) {
            if(group.allPosition > this.#allPosition) this.#allPosition = group.allPosition;
            if(group.pinnedPosition > this.#pinnedPosition) this.#pinnedPosition = group.pinnedPosition;
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
        this.#localDB = await openDB(this.#databaseName, this.#databaseVersion, {
            upgrade(db) {
                const links = db.createObjectStore('linkbookLinks', {keyPath: 'id', autoIncrement: true});
                links.createIndex('parent', 'parent');
                links.createIndex('allPosition', 'allPosition');
                links.createIndex('pinnedPosition', 'pinnedPosition');
                db.createObjectStore('linkbookGroups', {keyPath: 'id', autoIncrement: true});
            }
        });
    }

    async createLink(name, link, parent, isPinned) {
        if(!this.#localDB) await this.#initializeDatabase();
        let linkId;
        let linkData;

        try {
            if(!name) {
                throw new SystemError('Create link called with unspecified name!');
            }

            if(!link) {
                throw new SystemError('Create link called with unspecified link!');
            }

            if(typeof name !== 'string') {
                throw new SystemError('Create link called with non string name!');
            }

            if(typeof link !== 'string') {
                throw new SystemError('Create link called with non string link!');
            }
            
            if(name.trim().length === 0) {
                throw new UserError('Try again by specifying a name for your link shortcut!');
            }

            if(link.trim().length === 0) {
                throw new UserError('Try again by specifying a link for your link shortcut!');
            }
        } catch(err) {
            this.#onErrorHandle(err);
            return null;
        }

        if(!parent || typeof parent !== 'number' || parent < 0) {
            parent = 0;
        }

        if(!isPinned || typeof isPinned !== 'boolean') {
            isPinned = false;
        }

        let allPosition = this.#allPosition + 1000;
        if(parent !== 0) {
            allPosition = (await this.getGroup(parent)).groupPosition + 1000;
            await this.#editGroupPosition(parent, allPosition);
        }

        linkData = {
            name, 
            link, 
            parent, 
            isPinned,
            allPosition,
            pinnedPosition: isPinned ? this.#pinnedPosition + 1000: 0
        };

        try {
            linkId = await this.#localDB.put('linkbookLinks', linkData);
        } catch (err) {
            const linkSaveError = new SystemError(err);
            this.#onErrorHandle(linkSaveError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return {id: linkId, ...linkData};
    }

    async getLink(linkId) {
        if(!this.#localDB) await this.#initializeDatabase();
        let data;

        try {
            data = await this.#localDB.get('linkbookLinks', linkId);
            if(!data) data = null;
        } catch(err) {
            const getLinkError = new SystemError(err);
            this.#onErrorHandle(getLinkError);
            data = null;
        }

        return data;
    }

    async getLinks() {
        if(!this.#localDB) await this.#initializeDatabase();
        let links;
        
        try {
            links = await this.#localDB.getAll('linkbookLinks');
        } catch(err) {
            const getLinksError = new SystemError(err);
            this.#onErrorHandle(getLinksError);
            links = [];
        }

        return links;
    }

    async editLinkNameAndLink(linkId, newName, newLink) {
        if(!this.#localDB) await this.#initializeDatabase();

        const oldLinkData = await this.getLink(linkId);
        if(!oldLinkData) {
            nullDataError = new SystemError('Unable to edit link as it might have been deleted!');
            this.#onErrorHandle(nullDataError);
            return null;
        }
        let newLinkData;

        try {
            if(!newName || !newLink) {
                throw new SystemError('Edit link called with unspecified newName or newLink!');
            }

            if(typeof newName !== 'string' || typeof newLink !== 'string') {
                throw new SystemError('Edit link called with non string newName or newLink!');
            } 
        } catch(err) {
            this.#onErrorHandle(err);
            return null;
        }

        if(newName.trim().length === 0) {
            newName = oldLinkData.name;
        }

        if(newLink.trim().length === 0) {
            newLink = oldLinkData.link;
        }

        newLinkData = {...oldLinkData, name: newName, link: newLink};

        try {
            await this.#localDB.put('linkbookLinks', newLinkData);
        } catch(err) {
            const editLinkError = new SystemError(err);
            this.#onErrorHandle(editLinkError);
            return null;
        }
            
        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return newLinkData;
    }

    async deleteLink(linkId) {
        if(!this.#localDB) await this.#initializeDatabase();
        const data = await this.getLink(linkId);

        if(!data) {
            nullDataError = new SystemError('Unable to delete link as it might have already been deleted!');
            this.#onErrorHandle(nullDataError);
            return null;
        }

        try {
            await this.#localDB.delete('linkbookLinks', linkId);
        } catch(err) {
            const deleteLinkError = new SystemError(err);
            this.#onErrorHandle(deleteLinkError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return linkId;
    }

    async editLinkPin(linkId, isPinned) {
        if(!this.#localDB) await this.#initializeDatabase();
        const data = await this.getLink(linkId);
        let linkData;

        if(!data) {
            nullDataError = new SystemError('Unable to edit link\'s pin mode as it might have been deleted!');
            this.#onErrorHandle(nullDataError);
            return null;
        }

        linkData = {...data, isPinned};

        try {
            await this.#localDB.put('linkbookLinks', linkData);
        } catch(err) {
            const editLinkPinError = new SystemError(err);
            this.#onErrorHandle(editLinkPinError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return linkData;
    }

    async createGroup(isPinned) {
        if(!this.#localDB) await this.#initializeDatabase();
        let groupId;
        let group; 

        if(!isPinned || typeof isPinned !== 'boolean') {
            isPinned = false;
        }

        group = {
            name: '', 
            isPinned,
            allPosition: this.#allPosition + 1000,
            pinnedPosition: isPinned ? this.#pinnedPosition + 1000: 0,
            groupPosition: 0
        };

        try {
            groupId = await this.#localDB.put('linkbookGroups', group);
        } catch(err) {
            const createGroupError = new SystemError(err);
            this.#onErrorHandle(createGroupError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return {id: groupId, ...group};
    }

    async getGroup(groupId) {
        if(!this.#localDB) await this.#initializeDatabase();
        let data;

        try {
            data = await this.#localDB.get('linkbookGroups', groupId);
            if(!data) data = null;
        } catch(err) {
            const getGroupError = new SystemError(err);
            this.#onErrorHandle(getGroupError);
            return null;
        }

        return data;
    }

    async getGroups() {
        if(!this.#localDB) await this.#initializeDatabase();
        let data;

        try {
            data =  await this.#localDB.getAll('linkbookGroups');
        } catch(err) {
            const getGroupsError = new SystemError(err);
            this.#onErrorHandle(getGroupsError);
            data = [];
        }

        return data;
    }

    async getGroupChildren(groupId) {
        if(!this.#localDB) await this.#initializeDatabase();

        let children;
        const group = this.getGroup(groupId);
        if(!group) {
            nullGroupError = new SystemError('Unable to get group\'s children as it might have been deleted!');
            this.#onErrorHandle(nullGroupError);
            return null;
        }

        try {
            children = await this.#localDB.getAllFromIndex('linkbookLinks', 'parent', groupId);
        } catch(err) {
            const getChildrenError = new SystemError(err);
            this.#onErrorHandle(getChildrenError);
            children = [];
        }

        return children;
    }

    async editGroupName(groupId, newName) {
        if(!this.#localDB) await this.#initializeDatabase();
        
        const oldGroup = await this.getGroup(groupId);
        if(!oldGroup) {
            nullGroupError = new SystemError('Unable to edit group as it might have been deleted!');
            this.#onErrorHandle(nullGroupError);
            return null;
        }
        const newGroup = {...oldGroup, name: newName};

        try {
            await this.#localDB.put('linkbookGroups', newGroup);
        } catch(err) {
            const editGroupError = new SystemError(err);
            this.#onErrorHandle(editGroupError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return newGroup;
    }

    async deleteGroup(groupId) {
        if(!this.#localDB) await this.#initializeDatabase();
        const data = await this.getGroup(groupId);
        if(!data) {
            nullGroupError = new SystemError('Unable to delete group as it might have already been deleted!');
            this.#onErrorHandle(nullGroupError);
            return null;
        }

        try {
            await this.#localDB.delete('linkbookGroups', groupId);
        } catch(err) {
            const deleteGroupError = new SystemError(err);
            this.#onErrorHandle(deleteGroupError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return data;
    }

    async editGroupPin(groupId, isPinned) {
        if(!this.#localDB) await this.#initializeDatabase();

        const data = await this.getGroup(groupId);
        if(!data) {
            nullGroupError = new SystemError('Unable to edit group\'s pin mode as it might have been deleted!');
            this.#onErrorHandle(nullGroupError);
            return null;
        }
        const newGroup = {...data, isPinned};

        try {
            await this.#localDB.put('linkbookGroups', newGroup);
        } catch(err) {
            const deleteGroupError = new SystemError(err);
            this.#onErrorHandle(deleteGroupError);
            return null;
        }

        this.#onLinkbookDataChanged(await this.compileLinkbookData());
        return newGroup;
    }

    async #editGroupPosition(groupId, newPosition) {
        if(!this.#localDB) await this.#initializeDatabase();
        
        const oldGroup = await this.getGroup(groupId);
        if(!oldGroup) {
            nullGroupError = new SystemError('Unable to edit group as it might have been deleted!');
            this.#onErrorHandle(nullGroupError);
            return null;
        }
        const newGroup = {...oldGroup, groupPosition: newPosition};

        try {
            await this.#localDB.put('linkbookGroups', newGroup);
        } catch(err) {
            const editGroupError = new SystemError(err);
            this.#onErrorHandle(editGroupError);
            return null;
        }

        return newGroup;
    }

    async relocate(relocationData) {
        console.log(relocationData);
        if(relocationData.selectedType === 'link' && relocationData.newPositionType === 'link') {
            console.log('link relocation structure');
        } else if(relocationData.selectedType === 'link' && relocationData.newPositionType === 'group') {
            console.log('link to group relocation structure');
        } else {
            console.log('group relocation structure');
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
    #linkDataDetails;
    #linkDataFormNameField;
    #linkDataFormNameError;
    #linkDataFormLinkField;
    #linkDataFormLinkError;
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

    #onOpenLink;
    #onOpenLinkDataForm;
    #onOpenOptionsMenu;
    #onGroupEditSave;
    #onSelectForRelocation;
    #onRelocateActivate;
    #onRelocateSuccess;

    #selectedElement;
    #selectedType;

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
        this.#linkDataDetails = this.getElement('.link-content-form__details', this.#linkDataForm);
        this.#linkDataFormNameField = this.getElement('[name="link-form-name"]', this.#linkDataForm);
        this.#linkDataFormNameError = this.getElement('#link-form-name-error');
        this.#linkDataFormLinkField = this.getElement('[name="link-form-link"]', this.#linkDataForm);
        this.#linkDataFormLinkError = this.getElement('#link-form-link-error');
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


        this.#pinnedLinksList.addEventListener('mousemove', event => {
            if(event.buttons !== 1) return;
            this.#pinnedLinksList.classList.add('js-move');
        });

        this.#allLinksList.addEventListener('mousemove', event => {
            if(event.buttons !== 1) return;
            this.#allLinksList.classList.add('js-move');
            if(this.#selectedElement) this.#selectedElement.classList.add('js-selected-element');
        });
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

    bindCreateGroup(handler) {
        this.#pinnedLinksNewGroupButton.addEventListener('click', _ => handler(true));
        this.#allLinksNewGroupButton.addEventListener('click', _ => handler(false));
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
            if(!this.#linkDataDetails.checkValidity()) return;

            const data = {
                name: this.#linkDataFormNameField.value,
                link: this.#linkDataFormLinkField.value
            };
            if(this.#linkDataForm.getAttribute('data-id')) {
                data.id = parseInt(this.#linkDataForm.getAttribute('data-id'));
                this.#linkDataForm.removeAttribute('data-id');
            }

            handler(data);
        });

        this.#linkDataFormNameField.setAttribute('aria-invalid', 'false');
        this.#linkDataFormNameField.addEventListener('invalid', event => {
            invalidate(event);
        });

        this.#linkDataFormNameField.addEventListener('input', event => {
            this.#linkDataFormNameField.setAttribute('aria-invalid', 'false');
        });

        this.#linkDataFormLinkField.setAttribute('aria-invalid', 'false');
        this.#linkDataFormLinkField.addEventListener('invalid', event => {
            invalidate(event);
        });

        this.#linkDataFormLinkField.addEventListener('input', event => {
            this.#linkDataFormLinkField.setAttribute('aria-invalid', 'false');
        });
        
        const invalidate = event => {
            switch(event.target.name) {
                case 'link-form-name':
                    this.#linkDataFormNameField.setAttribute('aria-invalid', 'true');
                    this.#linkDataFormNameError.textContent = event.target.validationMessage;
                    break;
                case 'link-form-link':
                    this.#linkDataFormLinkField.setAttribute('aria-invalid', 'true');
                    this.#linkDataFormLinkError.textContent = event.target.validationMessage;
                    break;
                default:
                    console.error('This element doesn\'t have an error box');
            }
        };
    }

    bindGroupEditSave(handler) {
        this.#onGroupEditSave = handler;
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

    bindOpenLink(handler) {
        this.#onOpenLink = handler;
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

    bindSelectForRelocation(handler) {
        this.#onSelectForRelocation = handler;
    }

    bindRelocationActivate(handler) {
        this.#onRelocateActivate = handler;
    }

    bindRelocateSuccess(handler) {
        this.#onRelocateSuccess = handler;
    }

    bindRelocateCancel(handler) {
        this.#app.addEventListener('mouseup', event => {
            handler();
        });
    }

    #createLinkDisplay(linkData, isPinned, location) {
        const linkRoot = this.createElement('button', 'linkbook-browser-links-group__link-item');
        const linkDetails = this.createElement('div', 'linkbook-browser-links-group__link-item-details');
        const linkImg = this.createElement('img', 'linkbook-browser-links-group__link-item-icon');   
        const linkNameText = this.createElement('span', 'linkbook-browser-links-group__link-item-name');

        linkImg.src = `https://www.google.com/s2/favicons?domain=${linkData.link}&sz=64`;
        linkNameText.textContent = `${linkData.name}:${!isPinned ? linkData.allPosition : linkData.pinnedPosition}`;

        linkRoot.setAttribute('data-id', `${linkData.id}-${linkData.type}`);
        linkRoot.setAttribute('data-location', location);

        linkRoot.append(linkDetails);
        linkDetails.append(linkImg, linkNameText);

        let isOpenable = true;

        linkRoot.addEventListener('mouseup', event => {
            if(!isOpenable) {
                isOpenable = true;
                return;
            }
            if(
                event.target.classList.contains('options-button__icon') ||
                event.target.classList.contains('button--small')
            ) return;

            const openInNewTab = !event.altKey;
            this.#onOpenLink(linkData.link, openInNewTab);
        });

        linkRoot.addEventListener('contextmenu', event => {
            event.preventDefault();
            event.stopPropagation();

            isOpenable = false;
            this.#onOpenOptionsMenu(linkRoot, linkData.type, linkData.id, isPinned, {pin: !isPinned, unpin: isPinned && location === 'pinned', edit: true, delete: true});
        });

        linkRoot.addEventListener('mousemove', event => {
            if(!this.#selectedElement) return;
            if(this.#selectedType === 'group' && linkData.parent !== 0) return;
            const rootData = linkRoot.getBoundingClientRect();

            event.currentTarget.classList.remove('js-hovered-link-top');
            event.currentTarget.classList.remove('js-hovered-link-bottom');
            if(event.clientY < rootData.y + rootData.height / 2) {
                event.currentTarget.classList.add('js-hovered-link-top');
            } else {
                event.currentTarget.classList.add('js-hovered-link-bottom');
            }

            this.#onRelocateActivate();
        });

        linkRoot.addEventListener('mouseleave', event => {
            if(!this.#selectedElement) return;
            event.currentTarget.classList.remove('js-hovered-link-top');
            event.currentTarget.classList.remove('js-hovered-link-bottom');
        });

        linkRoot.addEventListener('mousedown', event => {
            event.stopPropagation();
            console.log('select', event.currentTarget.getAttribute('data-id'));
            this.#selectedElement = event.currentTarget;
            this.#selectedType = 'link';
            this.#onSelectForRelocation(linkData.id, 'link');
        });

        linkRoot.addEventListener('mouseup', event => {
            console.log('deselect', event.currentTarget.getAttribute('data-id'));
            const elementData = event.currentTarget.getAttribute('data-id').split('-');
            let position = null;

            const rootData = linkRoot.getBoundingClientRect();
            if(event.clientY < rootData.y + rootData.height / 2) {
                position = 'below';
            } else {
                position = 'above';
            }

            this.#onRelocateSuccess(elementData[0], elementData[1], position);

            linkRoot.classList.remove('js-hovered-link-top');
            linkRoot.classList.remove('js-hovered-link-bottom');
            this.#pinnedLinksList.classList.remove('js-move');
            this.#allLinksList.classList.remove('js-move');
            if(this.#selectedElement) {
                this.#selectedElement.classList.remove('js-selected-element');
                this.#selectedElement = null;
                this.#selectedType = '';
            }
        });

        return linkRoot;
    }

    #createGroupDisplay(groupData, isPinned, location) {
        const groupRoot = this.createElement('div', 'linkbook-browser-links-group');
        const groupHeader = this.createElement('div', 'linkbook-browser-links-group__header');
        const groupHeaderDetails = this.createElement('div', 'linkbook-browser-links-group__header-details');
        const groupHeaderOptions = this.createElement('div', 'linkbook-browser-links-group__header-options');
        const groupHeaderOptionAddLinkButton = this.createElement('button', 'linkbook-browser-links-group__header-option-icon', 'add-link-button');
        const groupLinkList = this.createElement('div', 'linkbook-browser-links-group__links');

        groupHeaderDetails.innerHTML = `
            <svg class="linkbook-browser-links-group__header-icon" width="16" height="16" viewBox="0 0 16 16">
                <path d="M3.5 13.5H12.5C13.3273 13.5 14 12.8273 14 12V6C14 5.17266 13.3273 4.5 12.5 4.5H8.75C8.51328 4.5 8.29062 4.38984 8.15 4.2L7.7 3.6C7.41641 3.22266 6.97109 3 6.5 3H3.5C2.67266 3 2 3.67266 2 4.5V12C2 12.8273 2.67266 13.5 3.5 13.5Z" fill="#E6E6E6"/>
            </svg>
            <span class="linkbook-browser-links-group__header-title">
                ${groupData.name}:${!isPinned ? groupData.allPosition : groupData.pinnedPosition}
            </span>
        `;
        groupHeaderOptionAddLinkButton.innerHTML = '<svg class="new-link-button__icon new-link-button__icon--secondary" width="16" height="13" viewBox="0 0 16 13"><path d="M14.07 6.7925C15.4825 5.38 15.4825 3.0925 14.07 1.68C12.82 0.430004 10.85 0.267504 9.4125 1.295L9.3725 1.3225C9.0125 1.58 8.93 2.08 9.1875 2.4375C9.445 2.795 9.945 2.88 10.3025 2.6225L10.3425 2.595C11.145 2.0225 12.2425 2.1125 12.9375 2.81C13.725 3.5975 13.725 4.8725 12.9375 5.66L10.1325 8.47C9.345 9.2575 8.07 9.2575 7.2825 8.47C6.585 7.7725 6.495 6.675 7.0675 5.875L7.095 5.835C7.3525 5.475 7.2675 4.975 6.91 4.72C6.5525 4.465 6.05001 4.5475 5.79501 4.905L5.7675 4.945C4.7375 6.38 4.90001 8.35 6.15001 9.6C7.56251 11.0125 9.85 11.0125 11.2625 9.6L14.07 6.7925ZM1.08 6.2075C-0.332495 7.62 -0.332495 9.9075 1.08 11.32C2.33 12.57 4.30001 12.7325 5.73751 11.705L5.77751 11.6775C6.13751 11.42 6.22001 10.92 5.96251 10.5625C5.70501 10.205 5.205 10.12 4.8475 10.3775L4.80751 10.405C4.00501 10.9775 2.9075 10.8875 2.2125 10.19C1.425 9.4 1.425 8.125 2.2125 7.3375L5.0175 4.53C5.805 3.7425 7.08 3.7425 7.8675 4.53C8.56501 5.2275 8.655 6.325 8.0825 7.1275L8.05501 7.1675C7.7975 7.5275 7.8825 8.0275 8.24 8.2825C8.5975 8.5375 9.10001 8.455 9.35501 8.0975L9.3825 8.0575C10.4125 6.62 10.25 4.65 9 3.4C7.5875 1.9875 5.30001 1.9875 3.88751 3.4L1.08 6.2075Z" /></svg>';

        groupRoot.setAttribute('data-id', `${groupData.id}-${groupData.type}-${isPinned ? 'pinned' : 'all' }`);
        groupRoot.setAttribute('data-location', location);

        groupRoot.append(groupHeader, groupLinkList);
        groupHeader.append(groupHeaderDetails, groupHeaderOptions);
        groupHeaderOptions.append(groupHeaderOptionAddLinkButton);

        groupHeaderOptionAddLinkButton.addEventListener('click', _ => this.#onOpenLinkDataForm(groupData.id, (groupData.id !== 0 ? false : isPinned)));
        groupRoot.addEventListener('contextmenu', event => {
            event.preventDefault();
            event.stopPropagation();
            this.#onOpenOptionsMenu(groupRoot, groupData.type, groupData.id, isPinned, {pin: !isPinned, unpin: isPinned, edit: true, delete: true});
        });

        groupRoot.addEventListener('mousemove', event => {
            if(event.buttons !== 1) return;
            if(this.#selectedType === 'link') return;
            const rootData = groupRoot.getBoundingClientRect();

            groupRoot.classList.remove('js-hovered-group-top');
            groupRoot.classList.remove('js-hovered-group-bottom');
            if(event.clientY < rootData.y + rootData.height / 2) {
                groupRoot.classList.add('js-hovered-group-top');
            } else {
                groupRoot.classList.add('js-hovered-group-bottom');
            }

            this.#onRelocateActivate();
        });

        groupHeader.addEventListener('mouseenter', event => {
            if(!this.#selectedElement) return;
            if(this.#selectedType !== 'link') return;
            event.currentTarget.classList.add('js-hovered-group');
        });

        groupHeader.addEventListener('mouseleave', event => {
            if(!this.#selectedElement) return;
            event.currentTarget.classList.remove('js-hovered-group');
        });

        groupRoot.addEventListener('mouseleave', event => {
            if(!this.#selectedElement) return;
            groupRoot.classList.remove('js-hovered-group-top');
            groupRoot.classList.remove('js-hovered-group-bottom');
        });

        groupRoot.addEventListener('mousedown', event => {
            console.log('select', event.currentTarget.getAttribute('data-id'));
            event.currentTarget.classList.add('js-selected-element');
            this.#selectedElement = event.currentTarget;
            this.#selectedType = 'group';
            this.#onSelectForRelocation(groupData.id, 'group');
        });

        groupRoot.addEventListener('mouseup', event => {
            console.log('deselect', event.currentTarget.getAttribute('data-id'));
            const elementData = event.currentTarget.getAttribute('data-id').split('-');
            let position;

            const rootData = groupRoot.getBoundingClientRect();
            if(event.clientY < rootData.y + rootData.height / 2) {
                position = 'below';
            } else {
                position = 'above';
            }

            this.#onRelocateSuccess(elementData[0], elementData[1], position);

            groupHeader.classList.remove('js-hovered-group');
            groupRoot.classList.remove('js-hovered-group-top');
            groupRoot.classList.remove('js-hovered-group-bottom');
            this.#pinnedLinksList.classList.remove('js-move');
            this.#allLinksList.classList.remove('js-move');
            if(this.#selectedElement) {
                this.#selectedElement.classList.remove('js-selected-element');
                this.#selectedElement = null;
                this.#selectedType = '';
            }
        });

        return groupRoot;
    }

    editGroup(groupId, location) {
        const groupRoot = this.getElement(`[data-id="${groupId}-group-${location}"]`);       
        const groupHeaderDetailsName = this.getElement('.linkbook-browser-links-group__header-title', groupRoot);
        const groupHeaderOptions = this.getElement('.linkbook-browser-links-group__header-options', groupRoot);

        while(groupHeaderOptions.firstChild) {
            groupHeaderOptions.removeChild(groupHeaderOptions.lastChild);
        }

        const groupHeaderDetailsInput = this.createElement('input', 'linkbook-browser-links-group__header-input');
        groupHeaderDetailsInput.setAttribute('type', 'text');
        groupHeaderDetailsName.replaceWith(groupHeaderDetailsInput);

        groupHeaderDetailsInput.addEventListener('keypress', event => {
            if(event.key === 'Enter' && groupHeaderDetailsInput.value.length !== 0) {
                this.#onGroupEditSave(groupId, groupHeaderDetailsInput.value);
            }
        });

        groupHeaderDetailsInput.focus();
    }

    #createDisplayLinkDisplay(displayLinkData) {
        const displayRoot = this.createElement('div', 'pinned-group-link');
        const displayIcon = this.createElement('img', 'pinned-group-link__icon');
        const displayName = this.createElement('p', 'pinned-group-link__name');

        displayName.textContent = displayLinkData.name;
        displayIcon.src = `https://www.google.com/s2/favicons?domain=${displayLinkData.link}&sz=64`;

        displayRoot.append(displayIcon, displayName);

        displayRoot.addEventListener('click', event => {
            if(
                event.target.classList.contains('options-button__icon') ||
                event.target.classList.contains('button--small')
            ) return;

            const openInNewTab = !event.altKey;
            this.#onOpenLink(displayLinkData.link, openInNewTab);
        });

        return displayRoot;
    }

    #createDisplayGroupDisplay(displayGroupData) {
        const displayRoot = this.createElement('div', 'pinned-group');
        const displayDetails = this.createElement('div', 'pinned-group__details');
        const displayDetailsHeader = this.createElement('div', 'pinned-group__header');
        const displayDetailsHeaderTitle = this.createElement('h3', 'pinned-group__title');
        const displayDetailsLinks = this.createElement('div', 'pinned-group__links');

        displayDetailsHeaderTitle.textContent = displayGroupData.name;

        displayRoot.append(displayDetails);
        displayDetails.append(displayDetailsHeader, displayDetailsLinks);
        displayDetailsHeader.append(displayDetailsHeaderTitle);

        return displayRoot;
    }

    displayAllLinksCategory(elements) {
        while(this.#allLinksList.firstChild) {
            this.#allLinksList.removeChild(this.#allLinksList.lastChild);
        }

        for(const element of elements) {
            if(element.type === 'link') {
                const linkDisplay = this.#createLinkDisplay(element, false, 'all');
                this.#allLinksList.append(linkDisplay);
            } else {
                const groupDisplay = this.#createGroupDisplay(element, false, 'all');
                this.#allLinksList.append(groupDisplay);

                const groupList = this.getElement('.linkbook-browser-links-group__links', groupDisplay);
                for(const child of element.children) {
                    const linkDisplay = this.#createLinkDisplay(child, false, 'all-child');
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
            const groupDisplay = this.#createGroupDisplay(element, true, 'pinned');
            this.#pinnedLinksList.append(groupDisplay);

            const groupList = this.getElement('.linkbook-browser-links-group__links', groupDisplay);

            for(const child of element.children) {
                const linkDisplay = this.#createLinkDisplay(child, true, (element.id === 0 ? 'pinned' : 'pinned-child'));
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

    openLinkDataForm(editData) {
        if(editData) {
            this.getElement('[data-open-type="edit"]', this.#linkDataForm).classList.remove('link-content-form__details-title--hidden');
            this.#linkDataFormNameField.value = editData.name;
            this.#linkDataFormLinkField.value = editData.link;
            this.#linkDataForm.setAttribute('data-id', editData.id);
        } else {
            this.getElement('[data-open-type="create"]', this.#linkDataForm).classList.remove('link-content-form__details-title--hidden');
            this.#linkDataFormNameField.value = '';
            this.#linkDataFormLinkField.value = '';
        }

        this.#linkDataForm.classList.remove('link-content-form--disabled');  
    }

    closeLinkDataForm() {
        this.getElement('[data-open-type="create"]', this.#linkDataForm).classList.add('link-content-form__details-title--hidden');
        this.getElement('[data-open-type="edit"]', this.#linkDataForm).classList.add('link-content-form__details-title--hidden');
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

    createGlobalError(message) {
        const rootElement = this.createElement('div', 'global-error-box');
        const messageElement = this.createElement('p', 'glboal-error-box__message');

        messageElement.textContent = message;
        rootElement.append(messageElement);

        this.#app.append(rootElement);
        setTimeout(() => {
            rootElement.classList.add('global-error-box--enabled');
        }, 0);

        setTimeout(() => {
            rootElement.classList.remove('global-error-box--enabled');
            setTimeout(() => {
                rootElement.remove();
            }, 1000);
        }, 5 * 1000);
    }
}

class LinksController {
    #model;
    #view;

    #newLinkData;
    #moreOptionsState;

    #relocationData;
    #isRelocatable;

    constructor(model, view) {
        this.#model = model;
        this.#view = view;

        this.#model.bindLinkbookDataChanged(this.#onLinkbookDataChanged.bind(this));
        this.#model.bindErrorHandle(this.#onHandleError.bind(this));

        this.#view.bindOpenLink(this.#onOpenLink.bind(this));
        this.#view.bindOpenLinkDataForm(this.#onOpenLinkDataForm.bind(this));
        this.#view.bindCloseLinkDataForm(this.#onCloseLinkDataForm.bind(this));
        this.#view.bindSaveLinkDataForm(this.#onSaveLinkDataForm.bind(this));
        this.#view.bindCreateGroup(this.#onCreateGroup.bind(this));
        this.#view.bindGroupEditSave(this.#onGroupEditSave.bind(this));

        this.#view.bindOpenOptionsMenu(this.#onOpenOptionsMenu.bind(this));
        this.#view.bindCloseOptionsMenu(this.#onCloseOptionsMenu.bind(this));
        this.#view.bindOptionsMenuPin(this.#onOptionsMenuPin.bind(this));
        this.#view.bindOptionsMenuUnpin(this.#onOptionsMenuUnpin.bind(this));
        this.#view.bindOptionsMenuEdit(this.#onOptionsMenuEdit.bind(this));
        this.#view.bindOptionsMenuDelete(this.#onOptionsMenuDelete.bind(this));

        this.#view.bindSelectForRelocation(this.#onSelectForRelocation.bind(this));
        this.#view.bindRelocationActivate(this.#onRelocateActivate.bind(this));
        this.#view.bindRelocateSuccess(this.#onRelocateSuccess.bind(this));
        this.#view.bindRelocateCancel(this.#onRelocateCancel.bind(this));

        (async () => {
            const groups = await this.#model.getGroups();
            for(const group of groups) {
                if(group.name.length !== 0) continue;
                this.#model.deleteGroup(group.id);
            }
            const data = await this.#model.compileLinkbookData();
            this.#onLinkbookDataChanged(data);
        })();
    }

    #onLinkbookDataChanged(data) {
        const linksDisplay = {
            id: 0, 
            type: 'group', 
            name: 'Links', 
            isPinned: 'true', 
            children: [], 
            pinnedPosition: 0,
            groupPosition: 0
            
        };
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

        if(displayData.length !== 0) {
            const groupLinkChildren = displayData[0].children;
            if(groupLinkChildren.children !== 0) {
                const quickNavLinks = new Map();
                groupLinkChildren.forEach((link, index) => {
                    quickNavLinks.set(index + 1, link.link);
                });

                document.addEventListener('keydown', event => {
                    if(!event.ctrlKey) return;
                    const quickNavElementId = parseInt(event.key);

                    if(isNaN(quickNavElementId)) return;
                    if(!quickNavLinks.has(quickNavElementId)) return;

                    this.#onOpenLink(quickNavLinks.get(quickNavElementId), !event.altKey);
                });
            }
        }


        this.#view.displayAllLinksCategory(data);
        this.#view.displayPinnedLinksCategory(displayData);
        this.#view.displayPinnedLinksDisplay(displayData);
    }

    #onOpenLink(link, newTab) {
        if(this.#isRelocatable) {
            return;
        }
        const url = link.startsWith('http') ? link : `https://${link}`;

        if(!newTab) {
            location.assign(url);
        } else {
            open(url);
        }

    }
    
    #onOpenLinkDataForm(parentId, isPinned) {
        this.#newLinkData = {parent: parentId, isPinned};
        this.#view.openLinkDataForm(null);
    }

    #onCloseLinkDataForm() {
        this.#newLinkData = null;
        this.#view.closeLinkDataForm();
    }

    async #onSaveLinkDataForm(formData) {
        if(!formData.id) {
            const linkData = {...formData, ...this.#newLinkData};
            const data = await this.#model.createLink(linkData.name, linkData.link, linkData.parent, linkData.isPinned)
            if(!data) return;
        } else {
            const data = this.#model.editLinkNameAndLink(formData.id, formData.name, formData.link);
            if(!data) return;
        }

        this.#onCloseLinkDataForm();
    }

    #onCreateGroup(isPinned) {
        this.#model.createGroup(isPinned)
            .then(group => {
                if(!group) return;
                this.#view.editGroup(group.id, isPinned ? 'pinned' : 'all')
            });
    }

    #onGroupEditSave(groupId, groupName) {
        this.#model.editGroupName(groupId, groupName);
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
            this.#model.editLinkPin(this.#moreOptionsState.id, true);
        else
            this.#model.editGroupPin(this.#moreOptionsState.id, true);
    }

    #onOptionsMenuUnpin() {
        if(this.#moreOptionsState.type === 'link')
            this.#model.editLinkPin(this.#moreOptionsState.id, false);
        else
            this.#model.editGroupPin(this.#moreOptionsState.id, false);
    }

    #onOptionsMenuEdit() {
        if(this.#moreOptionsState.type === 'link') {
            this.#model.getLink(this.#moreOptionsState.id)
                .then(link => {
                    // TODO: Handle empty link by displaying an error to the user
                    if(!link) return;
                    this.#view.openLinkDataForm(link);
                });
            
        } else {
            this.#view.editGroup(this.#moreOptionsState.id, this.#moreOptionsState.isPinned ? 'pinned' : 'all');
        }
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

    #onSelectForRelocation(selectedElementId, selectedElementType) {
        this.#relocationData = {selectedId: selectedElementId, selectedType: selectedElementType};
    }

    #onRelocateActivate() {
        this.#isRelocatable = true;
    }

    #onRelocateCancel() {
        if(!this.#relocationData) return;
        this.#relocationData = null;
        this.#isRelocatable = false;
    }

    #onRelocateSuccess(positionElementId, positionElementType, selectedElementLocation) {
        if(!this.#isRelocatable || !this.#relocationData || (this.#relocationData.selectedType === 'link' && this.#relocationData.newPositionId)) return;
        this.#relocationData.newPositionId = positionElementId;
        this.#relocationData.newPositionType = positionElementType;
        this.#relocationData.newPositionDirection = selectedElementLocation;

        this.#model.relocate(this.#relocationData);
    }

    #onHandleError(error) {
        if(error.constructor.name === 'UserError') {
            this.#view.createGlobalError(error.message);
        } else {
            console.error(error.message, error.name, error.stack);
        }
    }
}

class UserError extends Error {
    constructor(error) {
        if(typeof error === 'string') {
            super(error);
        } else {
            super(error.message);
            this.cause = error;
        }

        this.name = 'UserError';
    }
}

class SystemError extends Error {
    constructor(error) {
        if(typeof error === 'string') {
            super(error);
        } else {
            super(error.message);
            this.cause = error;
        }

        this.name = 'SystemError';
    }
}

let model;
let app;
addEventListener('DOMContentLoaded', _ => {
    model = new LinksModel()
    app = new LinksController(model, new LinkbookView());
})
