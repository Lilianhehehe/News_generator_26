import { handleApi } from "../server.js";

export default async function handler(req, res) {
  await handleApi(req, res);
}
