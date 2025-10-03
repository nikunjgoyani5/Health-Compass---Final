import axios from "axios";
import config from "../config/config.js";
import { StatusCodes } from "http-status-codes";

const baseUrl = `https://${config.mailchimp.dc}.api.mailchimp.com/3.0`;
const apiKey = config.mailchimp.apiKey;
const audienceId = config.mailchimp.audienceId;

const subscribeUser = async (email, tags = [], source = "") => {
  const url = `${baseUrl}/lists/${audienceId}/members`;
  const payload = {
    email_address: email,
    status: "subscribed",
    tags: tags,
  };

  try {
    const response = await axios.post(url, payload, {
      auth: {
        username: "darsh",
        password: apiKey,
      },
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errMsg =
      error.response?.data?.title || error.message || "Unknown error";

    return { success: false, error: errMsg };
  }
};

export default { subscribeUser };
