import admin from "firebase-admin";

let adminFirebaseApp;

try {
  if (!admin.apps.some((app) => app.name === "adminApp")) {
    adminFirebaseApp = admin.initializeApp(
      {
        credential: admin.credential.cert({
          type: "service_account",
          project_id: "health-compass-admin",
          private_key_id: "32979f2cf8f575ca1c72d25f11fe9b9cb5addff5",
          private_key:
            "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC8D49oTnEtxikv\nmUHguiWc6aEq9uOpU0i6eKeyASSKHUJy/013Otcg1VpQIWuo2J2Zv9Q3LzvnKBZT\nhkxkcPewA4QXYanQMoYti17iuGFcHrK8J/UGet5q8SRhPYOSfsXN9VcXVY7+XF5V\nh5UjDygr40514QNXwa68XtFsseQ/C3vlbomTqpfZBVN/V+oDnQwnidM4IbokwJ/r\nEW0HMynlu0O51mfDX5o3bMJYbJulKiZLoATrtLWPv0ohldIPGL0p7FCxHihQB751\nfju+pQzbgtpvR/wGW3APtpJcVjs7hbVSpEx8axTU9rxm61NQHCOsw5wG0NogWpyM\nTuQ4mCORAgMBAAECggEAGmc/3efnfYL9HNTyWhwgdEWb7mWP5KHQC/gtKTF+YRLH\nFdCw3lzJP++ceLQcgq35AJFdeOr9iNCIw+zO1GpE6DYyKTs5xYSWcJYI+iFjb/TS\naNbeUKzXBeI51po1mw+H84ju05ScWSt8RhtdTbkOzYyiIyw2lS9Y+lMAqbdXIZ+b\n+X5CEcrzOoSZHKN/0nZGVZT6hLJ7YqgFHxyb9gXeQcq103WNhde7ECEmNZVSlA0G\nKPcn5U95FGPcdAvP7q/PXMNde4q5XD/OOZ/YPWQ1N/TaxHJ8LLXXq1GfzpjY/oUy\nB2cz5a5aCWaTomGMbvFgzZBgGBT0250Wx0qf9EzarQKBgQDyNOVRtnHyPhIAXtni\nHkZeTQ1F+sXtHOotGIxyP9KkGrndPlXRfYexwmovcIpcpmcU4yPha58M9yVnCAdN\nSlWIS0Y2g6LFNpVea7Vg8rWXDwVB/acHRfKu3ldOUbvhoPcxgB6YbgGUyX+kugIS\nY8D4R3wsxAdkqzvr+dbn4DFeFQKBgQDGxUcsW7Nwp0J9TlADivDz2C63TVeuT5nb\nk50e0aXyBjZV//0Qg1ZpZ0fiOkkdU6UeTdfdoCO5ztlsd9UI7LHYEsZJLBBypVb0\n/KTAhpqJVRphwfcwGuTRU0eEFQvATnbg5i3jRiPliJX+wTkqGGWqZGQGS6PWeNCU\n5GwHefCKjQKBgG6UadIpqtI/NnbG11EeI2Bwa0v01yKPXfbiy1RqASB9Nzhkekff\nuPEWYuZvyivMqSlnHn2PZhlESOZGSxclhfFo9JB0/v5tEjr+j9vIU9G4wNzFEtoG\nPGtMBa4zMMUteU43QUC0kLI+YLFzXvjIZFS2RmIlyX5Tk1MESPKqb7+VAoGBALCH\nrHo8xtSZ93cKAg3ja7Nkn7izu9dXYrGcG8KvNs4HrmIag0oTGr9ptnG4ig69pruP\nLtPp0VDH4Flw44aVkCzyH6AEvmbTaLMTXc6OvNiS+GcxuLLEb8toRu+LMXCNPw7l\n3oMmW+MStwQV3wr/t+roVd0xeESV78kMRNUu+u5RAoGAVH8MCOl2B6Wl90yNYY6S\nFlZWIl/ua6LoqRfW35x+vhoMZCRL3EyOTyf2AESKLuCyaaE1v34DvXHiSoM/rIUC\nUWWmz1j3ZPQBVc696bS/+KR0yGb+JNBDeAZVKu68f0knZvzuz79FuAmIQLG8tFr/\n0tijC+SzpcehYzTdZCBFBMU=\n-----END PRIVATE KEY-----\n".replace(
              /\\n/g,
              "\n"
            ),
          client_email:
            "firebase-adminsdk-fbsvc@health-compass-admin.iam.gserviceaccount.com",
        }),
      },
      "adminApp" // 👈 unique name
    );
  } else {
    adminFirebaseApp = admin.app("adminApp");
  }
} catch (error) {
  console.error("Admin Firebase init error:", error.message);
  adminFirebaseApp = null;
}

export default adminFirebaseApp;
