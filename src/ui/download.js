/**
 * File download without the `downloads` permission: a temporary <a download> over a Blob URL.
 */

/**
 * @param {{dom: ReturnType<import('./dom.js').createDom>,
 *   urlApi: {createObjectURL(b: Blob): string, revokeObjectURL(u: string): void}}} deps
 * @returns {(file: {filename: string, text: string, mime: string}) => void}
 */
export function createDownload({ dom, urlApi }) {
  return ({ filename, text, mime }) => {
    const href = urlApi.createObjectURL(new Blob([text], { type: mime }));
    const link = dom.el('a', { attrs: { href, download: filename, hidden: true } });
    dom.doc.body.appendChild(link);
    link.click();
    link.remove();
    urlApi.revokeObjectURL(href);
  };
}
