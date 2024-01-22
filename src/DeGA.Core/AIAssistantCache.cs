using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;

namespace DeGA.Core
{
    public class AIAssistantCache : IAIAssistant
    {
        private readonly IWorkspaceAssistantCache _cache;
        private readonly IAIAssistant _wrappedAssistant;
        private readonly ILogger<AIAssistantCache> _logger;

        public AIAssistantCache(GeneratorWorkspace workspace, IAIAssistant wrappedAssistant, ILogger<AIAssistantCache> logger)
        {
            _cache = workspace.AssistantCache;
            _wrappedAssistant = wrappedAssistant;
            _logger = logger;
        }

        public async Task<string> CompletePromptAsync(string prompt)
        {
            var hash = CreateMD5Hash(prompt);
            var cached = await _cache.TryGetCachedAssistantResultAsync(hash);
            if (cached is not null)
            {
                _logger.LogInformation("Found cached response with hash {hash}", hash);
                return cached;
            }
            _logger.LogInformation("No cached response with hash {hash}", hash);

            var response = await _wrappedAssistant.CompletePromptAsync(prompt);

            await _cache.SetCachedAssistantResultAsync(hash, response);

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
