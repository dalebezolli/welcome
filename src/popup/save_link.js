'use strict';

import { openDB } from 'idb';

const nameInput = document.querySelector('.js-input');
const groupSelect = document.querySelector('.js-select');
const buttonCancel = document.querySelector('.js-button-cancel');
const buttonSave = document.querySelector('.js-button-save');

const databaseName = 'Primary';
const databaseVersion = '2';
let database;

let tabURL;

const getTab = async () => { 
    return (await browser.tabs.query({active: true}))[0];
};

const getGroups = async () => {
    database = await openDB(databaseName, databaseVersion);
    const groups = await database.getAll('linkbookGroups');
    groups.unshift({name: 'All Links', isPinned: false, id: 0});

    return groups;
};

getTab().then(tab => {
    nameInput.value = tab.title;
    tabURL = tab.url;
});

getGroups().then(savedGroups => {
    savedGroups.forEach(group => {
        const optionGroup = document.createElement('option');
        optionGroup.value = group.id;
        optionGroup.textContent = group.name;
        
        groupSelect.append(optionGroup);
    });
});

groupSelect.addEventListener('click', _ => {
    groupSelect.setAttribute(
        'data-open', 
        groupSelect.getAttribute('data-open') === 'true' ? 'false' : 'true'
    );
});

buttonCancel.addEventListener('click', event => {
    event.preventDefault();
    window.close();
});

buttonSave.addEventListener('click', event => {
    event.preventDefault();
    const data = {
        name: nameInput.value, 
        link: tabURL, 
        parent: parseInt(groupSelect.value)
    };

    database.put('linkbookLinks', data);
    window.close();
});
