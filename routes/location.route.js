import express from "express";
import multer from "multer";
import { getCityFromCoords, searchCities } from "../services/city.service.js";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/location.validation.js";

const route = express.Router();
const upload = multer();

route.get("/", searchCities);
route.post(
  "/detect-city",
  upload.none(), // parse form-data text fields
  validate(validation.coordsSchema),
  getCityFromCoords
);

export default route;
