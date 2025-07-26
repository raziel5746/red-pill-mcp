"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PopupOptionsSchema = exports.PopupTypeSchema = void 0;
const zod_1 = require("zod");
// Popup Management Types
exports.PopupTypeSchema = zod_1.z.enum(['info', 'warning', 'error', 'question', 'input']);
exports.PopupOptionsSchema = zod_1.z.object({
    title: zod_1.z.string(),
    message: zod_1.z.string(),
    type: exports.PopupTypeSchema,
    buttons: zod_1.z.array(zod_1.z.string()).optional(),
    defaultButton: zod_1.z.string().optional(),
    timeout: zod_1.z.number().optional(), // milliseconds
    modal: zod_1.z.boolean().optional(),
    inputPlaceholder: zod_1.z.string().optional(), // for input type popups
});
//# sourceMappingURL=index.js.map