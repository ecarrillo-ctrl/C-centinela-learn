import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';

export function parseSCORM(dirPath) {
  const manifestPath = path.join(dirPath, 'imsmanifest.xml');

  if (!fs.existsSync(manifestPath)) {
    throw new Error('imsmanifest.xml no encontrado en el paquete SCORM');
  }

  const xmlContent = fs.readFileSync(manifestPath, 'utf-8');

  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  let result = null;
  let error = null;

  parser.parseString(xmlContent, (err, res) => {
    if (err) { error = err; return; }
    result = res;
  });

  if (error || !result) {
    throw new Error('Error al parsear imsmanifest.xml');
  }

  const manifest = result.manifest;
  const metadata = manifest?.metadata || {};
  const organizations = manifest?.organizations?.organization;
  const resources = manifest?.resources?.resource;

  const title = (typeof metadata?.schema === 'string' ? '' : metadata?.lom?.general?.title?.string)
    || metadata?.lom?.general?.title || manifest?.identifier || 'Curso SCORM';

  const scormVersion = (metadata?.schemaversion || '1.2').toString();

  const resourcesArray = Array.isArray(resources) ? resources : (resources ? [resources] : []);
  const mainResource = resourcesArray.find((r) => r?.type === 'webcontent' || r?.href) || resourcesArray[0];
  const launchFile = mainResource?.href || 'index.html';

  const items = [];
  const orgs = Array.isArray(organizations) ? organizations : (organizations ? [organizations] : []);
  for (const org of orgs) {
    const orgItems = org?.item;
    if (Array.isArray(orgItems)) {
      for (const item of orgItems) {
        items.push({
          identifier: item?.identifier || '',
          title: item?.title || '',
          launch: item?.identifierref
            ? resourcesArray.find(r => r?.identifier === item.identifierref)?.href || launchFile
            : launchFile,
        });
      }
    } else if (orgItems) {
      items.push({
        identifier: orgItems?.identifier || '',
        title: orgItems?.title || '',
        launch: orgItems?.identifierref
          ? resourcesArray.find(r => r?.identifier === orgItems.identifierref)?.href || launchFile
          : launchFile,
      });
    }
  }

  if (items.length === 0) {
    items.push({ identifier: 'item_1', title: title, launch: launchFile });
  }

  return {
    title,
    scormVersion,
    launchFile,
    items,
  };
}

export function unwrapSCORMZip(zipPath, targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const zip = new AdmZip(zipPath);

  const entries = zip.getEntries();
  let rootDir = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const parts = entry.entryName.replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      rootDir = parts[0];
      break;
    }
  }

  if (rootDir && entries.some(e => e.entryName.replace(/\\/g, '/').startsWith(rootDir + '/'))) {
    zip.extractAllTo(targetDir, true);
  } else {
    zip.extractAllTo(targetDir, false);
  }

  const manifestPath = path.join(targetDir, 'imsmanifest.xml');
  if (fs.existsSync(manifestPath)) {
    return targetDir;
  }

  const scormDir = rootDir ? path.join(targetDir, rootDir) : targetDir;
  const altManifest = path.join(scormDir, 'imsmanifest.xml');
  if (fs.existsSync(altManifest)) {
    for (const file of fs.readdirSync(scormDir)) {
      const src = path.join(scormDir, file);
      const dest = path.join(targetDir, file);
      if (src !== altManifest) {
        try {
          fs.renameSync(src, dest);
        } catch {}
      }
    }
  }

  return targetDir;
}
