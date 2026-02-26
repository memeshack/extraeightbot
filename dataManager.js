const fs = require('fs');
const path = require('path');

const loadData = (file) => {
    try {
        if (!fs.existsSync(file)) return [];
        const d = fs.readFileSync(file, "utf8");
        return d.trim() ? JSON.parse(d) : [];
    } catch (e) { return []; }
};

const loadObjectData = (file) => {
    try {
        if (!fs.existsSync(file)) return {};
        const d = fs.readFileSync(file, "utf8");
        return d.trim() ? JSON.parse(d) : {};
    } catch (e) { return {}; }
};

const saveData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

module.exports = { loadData, loadObjectData, saveData };