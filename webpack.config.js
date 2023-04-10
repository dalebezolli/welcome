const path = require('path');

const environment = process.env.NODE_ENV;
const config = {
    entry: './src/main.js',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'main.bundle.js',
    },
    mode: environment,
};

module.exports = config;
