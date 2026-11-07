export { VERSION, TITLE, TEXT } from "./partner_terms_v1_1.js?v=20261106e";

import { VERSION as V1, TITLE as T1, TEXT as TEXT1 } from "./partner_terms_v1.js";
import { VERSION as V1_1, TITLE as T1_1, TEXT as TEXT1_1 } from "./partner_terms_v1_1.js?v=20261106e";

/** @type {Record<string, { version: string, title: string, text: string }>} */
export const AGREEMENTS = {
  [V1]: { version: V1, title: T1, text: TEXT1 },
  [V1_1]: { version: V1_1, title: T1_1, text: TEXT1_1 },
};

export function getAgreement(version) {
  return AGREEMENTS[version] || null;
}

export function getCurrentAgreementText(version) {
  const doc = getAgreement(version);
  return doc ? doc.text : "";
}
