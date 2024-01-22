namespace DeGA.Core
{
    public class GeneratorWorkspace(
        IWorkspaceFileSystem fileSystem, 
        IWorkspaceCommandLine commandLine,
        IWorkspaceAssistantCache assistantCache)
    {
        public IWorkspaceFileSystem FileSystem => fileSystem;
        public IWorkspaceCommandLine CommandLine => commandLine;
        public IWorkspaceAssistantCache AssistantCache => assistantCache;

        public Task InitializeAsync()
        {
            fileSystem.EnsureRootDirectory();
            fileSystem.CleanSourceDirectory();
            return Task.CompletedTask;
        }
    }
}
