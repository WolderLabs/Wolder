namespace DeGA.Core
{
    public interface IWorkspaceAssistantCache
    {
        Task<string?> TryGetCachedAssistantResultAsync(string key);
        Task SetCachedAssistantResultAsync(string key, string result);
    }
}
