import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import { Country } from "country-state-city";

const getCountries = async (req, res) => {
  try {
    const countries = (Country.getAllCountries() || []).map((c) => ({
      name: c.name,
      iso2: c.isoCode,
      phoneCode: c.phonecode,
      currency: c.currency,
    }));
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Countries fetched.",
      data: countries,
    });
  } catch {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to fetch countries.",
      data: null,
    });
  }
};

export default { getCountries };
