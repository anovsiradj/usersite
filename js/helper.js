
globalThis.makeIden = function(iden) {
    iden = iden.replace(/[^a-zA-Z0-9_]/g, '_')
    iden = iden.replace(/_{2,}/g, '_')
    iden = iden.replace(/^_/, '').replace(/_$/, '');
    return iden;
}

globalThis.makeItemIden = function(configName, item) {
    let name = item.file || btoa(item.code);
    let iden = `usersite_${configName}_${name}`;
    iden = makeIden(iden);
    return iden;
};

globalThis.makeConfigIden = function(configName) {
    let iden = `usersite_${configName}`;
    iden = makeIden(iden);
    return iden;
};