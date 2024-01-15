namespace DeGA.Core
{
    public class WorkspaceFileSystem : IWorkspaceFileSystem
    {
        private readonly string _rootDirectoryPath;

        public WorkspaceFileSystem(string rootDirectoryName)
        {
            string workingDirectory = Environment.CurrentDirectory;
            string? workspaceDirectory = Directory.GetParent(workingDirectory)?.Parent?.Parent?.Parent?.FullName;
            if (workspaceDirectory == null)
            {
                throw new InvalidOperationException("Could not find root directory.");
            }

            _rootDirectoryPath = Path.Combine(workspaceDirectory, rootDirectoryName);
        }

        public void EnsureRootDirectory()
        {
            Directory.CreateDirectory(_rootDirectoryPath);
        }

        public async Task<string> WriteFileAsync(string name, string text)
        {
            string filePath = Path.Combine(_rootDirectoryPath, name);
            await File.WriteAllTextAsync(filePath, text);
            return filePath;
        }

        public string GetAbsolutePath(string relativePath)
        {
            string filePath = Path.Combine(_rootDirectoryPath, relativePath);
            return filePath;
        }
    }
}
