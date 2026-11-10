import { withSupabase } from "npm:@supabase/server@1";
import { handleDeleteAccount } from "./handler.js";

export default {
  fetch: withSupabase({ auth: "user" }, handleDeleteAccount)
};
