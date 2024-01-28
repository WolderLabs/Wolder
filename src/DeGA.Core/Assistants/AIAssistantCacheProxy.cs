using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;

namespace DeGA.Core.Assistants
{
    public class AIAssistantCacheProxy(
        IAIAssistantCacheStore cacheStore,
        IAIAssistant wrappedAssistant,
        ILogger<AIAssistantCacheProxy> logger)
        : IAIAssistant
    {
        public async Task<string> CompletePromptAsync(string prompt)
        {
            var hash = CreateMD5Hash(prompt);
            var cached = await cacheStore.TryGetCachedAssistantResultAsync(hash);
            if (cached is not null)
            {
                logger.LogInformation("Found cached response with hash {hash}", hash);
                return cached;
            }
            logger.LogInformation("No cached response with hash {hash}", hash);

            var response = await wrappedAssistant.CompletePromptAsync(prompt);

            await cacheStore.SetCachedAssistantResultAsync(hash, response);

            return response;
        }

        public static string CreateMD5Hash(string input)
        {
            // Use input string to calculate MD5 hash
            using (MD5 md5 = MD5.Create())
            {
                byte[] inputBytes = Encoding.ASCII.GetBytes(input);
                byte[] hashBytes = md5.ComputeHash(inputBytes);

                // Convert the byte array to hexadecimal string
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < hashBytes.Length; i++)
                {
                    sb.Append(hashBytes[i].ToString("X2"));
                }
                return sb.ToString();
            }
        }
    }
}
