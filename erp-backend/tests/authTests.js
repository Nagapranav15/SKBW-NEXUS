const request = require("supertest");
const app = require("../src/app");

describe("Auth", () => {
  it("should register user", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Test",
      email: "test@test.com",
      password: "123456"
    });

    expect(res.statusCode).toBe(200);
  });
});