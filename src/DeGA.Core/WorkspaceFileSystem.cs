namespace DeGA.Core
{
    public class WorkspaceFileSystem : IWorkspaceFileSystem, IWorkspaceAssistantCache
    {
        private readonly string _rootDirectoryPath;
        private readonly string _srcDirectoryPath;
        private readonly string _assistantCacheDirectoryPath;

        public WorkspaceFileSystem(string rootDirectoryName)
        {
            string workingDirectory = Environment.CurrentDirectory;
            string? workspaceDirectory = Directory.GetParent(workingDirectory)?.Parent?.Parent?.Parent?.FullName;
            if (workspaceDirectory == null)
            {
                throw new InvalidOperationException("Could not find root directory.");
            }

            _rootDirectoryPath = Path.Combine(workspaceDirectory, rootDirectoryName);
            _srcDirectoryPath = Path.Combine(_rootDirectoryPath, "src");
            _assistantCacheDirectoryPath = Path.Combine(_rootDirectoryPath, "cache", "assistant");
        }

        public void EnsureRootDirectory()
        {
            Directory.CreateDirectory(_rootDirectoryPath);
            Directory.CreateDirectory(_srcDirectoryPath);
            Directory.CreateDirectory(_assistantCacheDirectoryPath);
        }

        public async Task<string> WriteFileAsync(string name, string text)
        {
            name = name.Trim().TrimStart('/', '\\');
            string filePath = Path.Combine(_srcDirectoryPath, name);
            Directory.CreateDirectory(Path.GetDirectoryName(filePath)!);
            await File.WriteAllTextAsync(filePath, text);
            return filePath;
        }

        public string GetAbsolutePath(string relativePath)
        {
            string filePath = Path.Combine(_srcDirectoryPath, relativePath);
            return filePath;
        }

        public async Task<string?> TryGetCachedAssistantResultAsync(string key)
        {
            string filePath = GetCachePath(key);
            if (File.Exists(filePath))
            {
                return await File.ReadAllTextAsync(filePath);
            }
            return null;
        }

        public async Task SetCachedAssistantResultAsync(string key, string result)
        {
            string filePath = GetCachePath(key);
            await File.WriteAllTextAsync(filePath, result);
        }

        private string GetCachePath(string key)
        {
            return Path.Combine(_assistantCacheDirectoryPath, $"{key}.txt");
        }

        public void CleanSourceDirectory()
        {
            if (Directory.Exists(_srcDirectoryPath))
            {
                Directory.Delete(_srcDirectoryPath, true);
            }
        }
    }
}
