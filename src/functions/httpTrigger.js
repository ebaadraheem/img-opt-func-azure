const {app}=require("@azure/functions")
app.http("httpTrigger", {
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: async (request, context) => {
        const name = (request.query.get("name") || (await request.json().name) || "world");
        return new Response(`Hello, ${name}!`);
    }
});