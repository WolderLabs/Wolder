using Wolder.Core.Files;

namespace Wolder.Core.Assistants;

public class AIAssistantCacheStore(ICacheFiles cacheFiles) : IAIAssistantCacheStore
{
    public async Task<string?> TryGetCachedAssistantResultAsync(string key)
    {
        return await cacheFiles.ReadFileAsync(key);
    }

    public async Task SetCachedAssistantResultAsync(string key, string result)
    {
        await cacheFiles.WriteFileAsync(key, result);
    }
}