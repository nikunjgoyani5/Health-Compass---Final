import admin from "firebase-admin";

let userFirebaseApp;

try {
  if (!admin.apps.some((app) => app.name === "userApp")) {
    userFirebaseApp = admin.initializeApp(
      {
        credential: admin.credential.cert({
          type: "service_account",
          project_id: "health-compass-60829",
          private_key_id: "81c0004c7e76f6dd6816e59b6f9e1316c33ec941",
          private_key:
            "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCmE4XgZENfPjv6\nqZjXq98Jk8ZbjtUFzJgIVuVw44/bDwTShUwjW4s9HqyqLz1r85CJ5Ai1JzL4lVrT\nH08r7kG9JFrq0vhc0RNvvBW6sCr2Mu/lnLXqhYpMStrntMwgagxbTKhVSkTuw7ub\ndntNu5GwzH9ZAXCc5PHFKWB2FnMOKBErcmpdBZFyfrX4zcVp62Qdr76ZRTdYp4sl\nOevawjLj4bn4QYMjJmMVYTz8rbJb3faAZ6i8oli9L9ZDc533KL+w0tcM3UOpcuia\nNdlkAWHiDVA1+KcB2J5veABl1ixuPRFVplYT327WJxaE1y/WswAASdFoOk+Pbell\nMPg7YVmjAgMBAAECggEAB20XDu4czxz2zKIZygcO7Zw0gfKUlvJLmA/eqZobXCXD\nRvCb83bL9psxCFkda37UJz5Rn1wV3OS8z3T2ctXwDZebEyYE4g2dS2FDLXpkKWck\nsAU+YzK+eOPd/v9oI0jqrYhzfIDaLT0GXhDBubuZ66hxR1cXpIReRT0w6YbedTMG\nA737l2YBt/id4S6zAXnDKTGcogpiSjblFn1EIMZo8uQ10mzI12tAqDI+yOnkZENm\nCEtdUfRiox/m9o+naRp7L/ggTbdcw6wPW7xPQ9dkEe7Dp65Z004JI2lLT89BdleP\nzm6Iynv93RCKO7Qhi/OXG6lRcVkFukY1y57X/HfS0QKBgQDSrB1v2ZQuscBy5I1T\nFigKV5vZzq0zY2GiWG4FQHLmUmHJOZ/VhZHiCb7GF0rNDcDdVH7edMsC6cdHr8FO\nLFSWKVWM+e5g9sKhihc5P4VpS+t7G7a4238qvsq4m3nOkjemSTWGjSI01LYddmTx\n4wxXb7CA3O1LF8Kc8wrp4FcXEQKBgQDJzwuoJWT4h1H+9UbZ1IEI4ohEvWbCx/ZY\nJZBmfW9W8AGad7thrzfPwjgyOC91mwGZQ4xmZ1DA7L0ROQJ23LPm7H2SPqQQ3PwZ\n1HCnYUVsnLLLPGnlRPrvverZAzlxl/fHCUQbqAqNCJzuYKlBTsvS3gwi7eLqaLyL\nqd7OmfQtcwKBgQC1KNRXbl6CmM/I/Miafh8IZbXbYmKGIhu/IxPY6Ebl0EnOZAMR\n9b4xBfhLF5R3KDCFIzfFy+EXLDj1aCluM6i5R+oNRI68SvWrO7gkvn7WwTZJstc5\nt2ZvN4nTnb7s58d68tFYVtznWVMRmtHLP1dJiP3akiBrxo7PsB/eZc/+QQKBgQCv\nnoY+ZYxg2yH4BesKVWuVF84OQ+TRTMKMIuRuzGm/9kzu55MhhyHCovnUeiCS77mM\nbsQXuYEE4wAFpN8IIThNlTARvIF6S1T4BW+juXp48kSFqKVe55CYYWWmRLAQsnbl\ntqKWjr3fzccDiwq/0pp9fs6A9xOpekvaHpHOqRtdEQKBgAUROG2yHpYYq+FW2x4C\n47U34DM0M2uAUyehNdmOq/h8cuyp42fftEGchLZPphdS0jrB39c72+NIHZXl6kqK\nc6pFtkMezH1OKJdnywU2SsRphwNmDjeZSPZFMIzb8GqTQAlZnDZ8Qw9/tQOSw8f8\nEsQ9ebZJdxUl4yJu2btRI+xD\n-----END PRIVATE KEY-----\n",
          client_email:
            "firebase-adminsdk-fbsvc@health-compass-60829.iam.gserviceaccount.com",
        }),
      },
      "userApp" // 👈 unique name
    );
  } else {
    userFirebaseApp = admin.app("userApp");
  }
} catch (error) {
  console.error("User Firebase init error:", error.message);
  userFirebaseApp = null;
}

export default userFirebaseApp;
