import mongoose from "mongoose";
const { Schema } = mongoose;

const IngredientDetailsSchema = new mongoose.Schema({
  groupName: { type: String, required: true },
  hits: { type: Array, default: [] },
}, { timestamps: true });

const IngredientDetails = mongoose.model("IngredientDetails", IngredientDetailsSchema);
export default IngredientDetails;
