/**
 * The docx package can only embed a font's regular style, so Word would fake bold and italic by
 * smearing and slanting it. This adds the real bold, italic and bold-italic files to a finished
 * .docx — alongside the regular one docx already embedded — and tells Word to keep embedded
 * fonts when the file is re-saved.
 */

type EmbedStyle = 'Bold' | 'Italic' | 'BoldItalic';

/** Word's font obfuscation (ECMA-376): the first 32 bytes XORed with the key GUID's bytes,
 * reversed. The same scheme docx applies to the regular file. */
function obfuscate(font: Uint8Array, guid: string): Uint8Array {
  const key = (guid.replace(/-/g, '').match(/../g) ?? []).map((h) => parseInt(h, 16)).reverse();
  const out = font.slice();
  for (let i = 0; i < 32 && i < out.length; i++) out[i] ^= key[i % key.length];
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function embedFontStyles(
  docx: Blob,
  fontName: string,
  files: Record<EmbedStyle, Uint8Array>,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await docx.arrayBuffer());
  const tablePath = 'word/fontTable.xml';
  const relsPath = 'word/_rels/fontTable.xml.rels';
  let table = await zip.file(tablePath)?.async('string');
  let rels = await zip.file(relsPath)?.async('string');
  if (!table || !rels) return docx; // the regular style wasn't embedded — nothing to add to

  const embedRegular = new RegExp(
    `(<w:font w:name="${escapeRegExp(fontName)}">[\\s\\S]*?<w:embedRegular [^>]*/>)`,
  );
  if (!embedRegular.test(table)) return docx;

  const usedIds = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  let nextId = Math.max(0, ...usedIds) + 1;
  let fontFiles = Object.keys(zip.files).filter((p) => p.startsWith('word/fonts/') && p.endsWith('.odttf')).length;

  // The schema requires embedRegular, embedBold, embedItalic, embedBoldItalic in that order.
  let embeds = '';
  for (const style of ['Bold', 'Italic', 'BoldItalic'] as EmbedStyle[]) {
    const id = `rId${nextId++}`;
    const guid = crypto.randomUUID().toUpperCase();
    const target = `fonts/font${++fontFiles}.odttf`;
    zip.file(`word/${target}`, obfuscate(files[style], guid));
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${target}"/></Relationships>`,
    );
    embeds += `<w:embed${style} r:id="${id}" w:fontKey="{${guid}}"/>`;
  }
  table = table.replace(embedRegular, `$1${embeds}`);
  zip.file(tablePath, table);
  zip.file(relsPath, rels);

  // Without this Word drops the embedded fonts the first time someone re-saves the file. The
  // schema fixes its position: after displayBackgroundShape (docx always writes that one).
  const settingsPath = 'word/settings.xml';
  const settings = await zip.file(settingsPath)?.async('string');
  if (settings && !settings.includes('<w:embedTrueTypeFonts')) {
    const anchor = settings.includes('<w:displayBackgroundShape/>') ? '<w:displayBackgroundShape/>' : null;
    if (anchor) zip.file(settingsPath, settings.replace(anchor, `${anchor}<w:embedTrueTypeFonts/>`));
  }

  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
