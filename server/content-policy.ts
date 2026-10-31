export function allowedWish(prompt: string) {
  if (!prompt.trim() || [...prompt].length > 450) return false;
  return !/(ignore\s+(all\s+)?(previous|prior|rules|instructions)|system\s*prompt|developer\s*message|api[ _-]?key|aws_bearer|twitch_\w+|reveal.{0,30}(secret|token)|https?:\/\/|file:\/\/|\.\.\/|<script|fetch\s*\(|eval\s*\(|import\s*\(|__proto__|execute\s+(code|javascript)|read\s+.{0,15}\.env|doxx|kill yourself|nazi|porn|mario|pok[eé]mon|pikachu|minecraft|disney|taylor swift|elon musk)/i.test(prompt);
}

