import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import MailchimpEvent from "../models/mailchimpEvent.model.js";
import mailchimpService from "../services/mailchimp.service.js";

export const subscribe = async (req, res) => {
  const { email, tags, source } = req.body;

  const result = await mailchimpService.subscribeUser(email, tags, source);

  let tagNames = [];
  if (result.success && result.data?.tags?.length) {
    tagNames = result.data.tags.map((t) => t.name);
  }

  // Log event
  const event = await MailchimpEvent.create({
    email,
    tags: tagNames,
    source: source,
    status: result.success ? "subscribed" : "failed",
    timestamp: new Date(),
    error: result.success ? null : result.error,
  });

  console.log("event: ", event);

  if (result.success) {
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "User subscribed successfully.",
      data: event,
    });
  } else {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.BAD_REQUEST,
      message: result.error || "Subscription failed.",
      data: null,
    });
  }
};

export const webhook = async (req, res) => {
  console.log("Webhook received: ", req.body);

  const body = req.body;
  const eventType = body.type || body["type"] || "unknown";
  const email = body.data?.email || body["data[email]"] || body.email || "";
  const eventStatus =
    eventType === "unsubscribe"
      ? "unsubscribe"
      : eventType === "subscribe"
      ? "subscribed"
      : eventType;

  await MailchimpEvent.create({
    email,
    eventType,
    status: eventStatus,
    source: "Mailchimp",
    payload: body,
    timestamp: new Date(),
    error: null,
  });

  return apiResponse({
    res,
    status: true,
    statusCode: StatusCodes.OK,
    message: "Webhook received",
    data: { body },
  });
};
