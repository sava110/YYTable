import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://tubatsjgmcazkkmrokmt.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1YmF0c2pnbWNhemtrbXJva210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MDk2OTAsImV4cCI6MjA3Nzk4NTY5MH0.LtiLewZQd2f2QHfDWNL2XyCC9hXTWylK1Y2-A8fXv_Y"
);
