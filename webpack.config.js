const path = require('path');

const environment = process.env.NODE_ENV;
const config = {
    entry: {
        'webapp': './src/webapp.js',
        'popup/save_link': './src/popup/save_link.js',
    },
    output: {
        path: path.join(__dirname, 'out'),
        filename: '[name].bundle.js',
    },
    mode: environment,
};

module.exports = config;
