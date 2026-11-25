/**
 * Background entry (composition root). Gets the browser API only through the platform adapter.
 */

import { getBrowserApi } from '../platform/browser-api.js';
import { buildApp } from './app.js';

const browserApi = getBrowserApi();
const onMessage = buildApp({ browserApi });
browserApi.runtime.onMessage.addListener((message, sender) => onMessage(message, sender));
