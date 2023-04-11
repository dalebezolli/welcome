const path = require('path');

const environment = process.env.NODE_ENV;
const config = {
    entry: {
        'webapp': './src/webapp.js',
    },
    output: {
        path: path.join(__dirname, 'out'),
        filename: '[name].bundle.js',
    },
    mode: environment,
};

module.exports = config;
