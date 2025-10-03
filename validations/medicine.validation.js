import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const allowedModes = Object.values(enumConfig.perspectiveEnums);

// Reusable schema for overlay notes
const overlayNoteValidation = Joi.object({
  mode: Joi.string()
    .valid(...allowedModes)
    .required()
    .messages({
      "any.only": `Mode must be one of: ${allowedModes.join(", ")}`,
      "any.required": "Mode is required",
    }),
  note: Joi.array().items(Joi.string().trim().allow("").optional()).required(),
});

// Reusable schema for string arrays (allow empty/null values)
const stringArray = Joi.array()
  .items(Joi.string().trim().allow("").optional())
  .optional()
  .allow(null);

// ------------------ ADD NEW MEDICINE ------------------
const addNewMedicineValidation = {
  body: Joi.object().keys({
    medicineName: Joi.string().required().label("Medicine Name"),
    dosage: Joi.string().required().label("Dosage"),
    description: Joi.string().allow("", null).label("Description"),
    takenForSymptoms: Joi.string().allow("", null).label("Taken For Symptoms"),
    associatedRisks: Joi.string().allow("", null).label("Associated Risks"),
    price: Joi.number().strict().min(0).required().label("Price"),
    quantity: Joi.number()
      .strict()
      .integer()
      .min(1)
      .required()
      .label("Quantity"),
    singlePack: Joi.string().required().label("Single Pack"),
    mfgDate: Joi.date().required().label("Manufacturing Date"),
    expDate: Joi.date()
      .greater(Joi.ref("mfgDate"))
      .required()
      .label("Expiry Date"),
    createdByAdmin: Joi.boolean().optional().label("Created By Admin"),

    // Phase-2 Fields
    brandName: Joi.string().allow(null, "").optional().label("Brand Name"),
    manufacturer: Joi.string().allow(null, "").optional().label("Manufacturer"),
    usage: Joi.string().allow(null, "").optional().label("Usage Instructions"),
    route: Joi.string()
      .allow(null, "")
      .optional()
      .label("Route of Administration"),
    sideEffects: stringArray.label("Side Effects"),
    warnings: stringArray.label("Warnings"),
    contraindications: stringArray.label("Contraindications"),
    storageInstructions: Joi.string()
      .allow(null, "")
      .optional()
      .label("Storage Instructions"),
    pregnancySafe: Joi.boolean()
      .optional()
      .allow(null)
      .label("Safe During Pregnancy"),
    pediatricUse: Joi.boolean().optional().label("Pediatric Use"),
    adverseReactions: stringArray.label("Adverse Reactions"),
    rxRequired: Joi.boolean()
      .optional()
      .allow(null)
      .label("Prescription Required"),

    // Spiritual Overlay Notes
    spiritualOverlayNotes: Joi.array()
      .items(overlayNoteValidation)
      .optional()
      .default([])
      .label("Spiritual Overlay Notes"),
  }),
};

// ------------------ UPDATE MEDICINE ------------------
const updateMedicineValidation = {
  body: Joi.object().keys({
    medicineName: Joi.string().label("Medicine Name"),
    dosage: Joi.string().label("Dosage"),
    description: Joi.string().allow("", null).label("Description"),
    takenForSymptoms: Joi.string().allow("", null).label("Taken For Symptoms"),
    associatedRisks: Joi.string().allow("", null).label("Associated Risks"),
    price: Joi.number().min(0).label("Price"),
    quantity: Joi.number().integer().min(1).label("Quantity"),
    singlePack: Joi.string().allow("", null).label("Single Pack"),
    mfgDate: Joi.date().label("Manufacturing Date"),
    expDate: Joi.date().label("Expiry Date"),

    // Phase-2 Fields
    brandName: Joi.string().allow(null, "").label("Brand Name"),
    manufacturer: Joi.string().allow(null, "").label("Manufacturer"),
    usage: Joi.string().allow(null, "").label("Usage Instructions"),
    route: Joi.string().allow(null, "").label("Route of Administration"),
    sideEffects: stringArray.label("Side Effects"),
    warnings: stringArray.label("Warnings"),
    contraindications: stringArray.label("Contraindications"),
    storageInstructions: Joi.string()
      .allow(null, "")
      .label("Storage Instructions"),
    pregnancySafe: Joi.boolean().label("Safe During Pregnancy"),
    pediatricUse: Joi.boolean().label("Pediatric Use"),
    adverseReactions: stringArray.label("Adverse Reactions"),
    rxRequired: Joi.boolean().label("Prescription Required"),

    // Spiritual Overlay Notes
    spiritualOverlayNotes: Joi.array()
      .items(overlayNoteValidation)
      .optional()
      .default([])
      .label("Spiritual Overlay Notes"),
  }),
};

// ------------------ ADD QUANTITY ------------------
const addQuantityValidation = {
  body: Joi.object().keys({
    quantity: Joi.number().integer().required().label("Quantity"),
  }),
};

export default {
  addNewMedicineValidation,
  updateMedicineValidation,
  addQuantityValidation,
};
