import { StatusCodes } from "http-status-codes";
import { verifyToken } from "./verify-token.middleware.js";
import { checkPermission } from "./verify-role.middleware.js";
import { apiResponse } from "../helper/api-response.helper.js";
import enumConfig from "../config/enum.config.js";

const isDevBypass = () =>
  process.env.NODE_ENV === "development" &&
  process.env.BYPASS_ACCESS === "true";

/**
 * Route-Level Access Control Middleware
 *
 * Usage:
 * router.get('/admin-data', routeAccessControl(['admin']), handler)
 * router.post('/ai/use', routeAccessControl(['premium']), handler)
 * router.get('/open-list', routeAccessControl(['public']), handler)
 *
 * Notes:
 * - 'public' allows access without token (but still attaches req.user if token is present)
 * - 'admin', 'doctor', 'superadmin', etc. match against roles in req.user.role
 * - 'premium' requires req.user.is_premium === true
 * - In development mode with BYPASS_ACCESS=true, token is still optionally verified to set req.user
 */

export function routeAccessControl(
  types = [enumConfig.accessControllerEnum.public]
) {
  return async (req, res, next) => {
    const accessList = Array.isArray(types) ? types : [types];
    const label = `🔒 Access attempted: [${accessList
      .join(", ")
      .toUpperCase()}] →`;

    // Allow bypass in development
    if (isDevBypass()) {
      console.log(`${label} Bypassed (dev mode)`);

      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      if (token) {
        try {
          await verifyToken(req, res, () => {});
        } catch (err) {
          console.warn("⚠️ Token invalid even in dev mode");
        }
      }

      req.user = req.user || {};
      return next();
    }

    try {
      if (accessList.includes(enumConfig.accessControllerEnum.public)) {
        console.log("🔓 Access granted: PUBLIC");

        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (token) {
          await verifyToken(req, res, () => {});
          req.user = req.user || {};
        } else {
          return apiResponse({
            res,
            statusCode: StatusCodes.FORBIDDEN,
            message: "Authorization token is required",
          });
        }

        return next();
      }

      await verifyToken(req, res, async () => {
        const user = req.user;

        // Handle 'premium' logic
        if (accessList.includes(enumConfig.accessControllerEnum.premium)) {
          const isPremium = user?.is_premium || user?.isSubscribed;
          if (isPremium) {
            console.log("🔒 Access granted: PREMIUM");
            return next();
          }
        }

        // Extract all valid role enums
        const validRoles = Object.values(enumConfig.userRoleEnum);

        // Check if any access type matches a role
        const allowedRoles = accessList.filter((t) => validRoles.includes(t));
        if (allowedRoles.length > 0) {
          return checkPermission(allowedRoles)(req, res, () => {
            console.log(
              `🔒 Access granted: ROLE MATCH (${allowedRoles.join(", ")})`
            );
            next();
          });
        }

        // If no match
        console.warn(`${label} Forbidden - No matching access type`);
        return apiResponse({
          res,
          statusCode: StatusCodes.FORBIDDEN,
          message: "Access denied",
        });
      });
    } catch (error) {
      console.warn(`${label} Error - ${error.message}`);
      return apiResponse({
        res,
        statusCode: StatusCodes.FORBIDDEN,
        message: "Access denied",
      });
    }
  };
}
