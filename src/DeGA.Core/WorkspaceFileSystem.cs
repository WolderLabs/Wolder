namespace DeGA.Core
{
    public class WorkspaceFileSystem : IWorkspaceFileSystem
    {
        private readonly string _rootDirectoryPath;

        public WorkspaceFileSystem(string rootDirectoryName)
        {
            string workingDirectory = Environment.CurrentDirectory;
            string? workspaceDirectory = Directory.GetParent(workingDirectory)?.Parent?.Parent?.FullName;
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

        public void CreateFile(string name)
        {
            string filePath = Path.Combine(_rootDirectoryPath, name);
            if (!File.Exists(filePath))
            {
                using (var stream = File.Create(filePath))
                {
                    // The using statement ensures that the file is closed and resources are released after creation
                }
            }
        }
    }
}
