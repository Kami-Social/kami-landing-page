export { VERSION, TITLE, TEXT } from "./partner_terms_v1.js";

import { VERSION as V1, TITLE as T1, TEXT as TEXT1 } from "./partner_terms_v1.js";

/** @type {Record<string, { version: string, title: string, text: string }>} */
export const AGREEMENTS = {
  [V1]: { version: V1, title: T1, text: TEXT1 },
};

export function getAgreement(version) {
  return AGREEMENTS[version] || null;
}

export function getCurrentAgreementText(version) {
  const doc = getAgreement(version);
  return doc ? doc.text : "";
}
