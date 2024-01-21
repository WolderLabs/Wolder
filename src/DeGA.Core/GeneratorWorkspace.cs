namespace DeGA.Core
{
    public class GeneratorWorkspace(IWorkspaceFileSystem fileSystem, IWorkspaceAssistantCache assistantCache)
    {
        public IWorkspaceFileSystem FileSystem => fileSystem;
        public IWorkspaceAssistantCache AssistantCache => assistantCache;

        public Task InitializeAsync()
        {
            fileSystem.EnsureRootDirectory();
            fileSystem.CleanSourceDirectory();
            return Task.CompletedTask;
        }
    }
}
