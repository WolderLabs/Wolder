namespace DeGA.Core
{
    public class GeneratorWorkspace
    {
        private readonly IWorkspaceFileSystem _fileSystem;
        private readonly LayerActionFactory _layerActionFactory;

        //public Workspace(string name)
        //{
        //    // TODO: Create new workspace service container
        //}

        public GeneratorWorkspace(IWorkspaceFileSystem fileSystem, LayerActionFactory layerActionFactory)
        {
            _fileSystem = fileSystem;
            _layerActionFactory = layerActionFactory;
        }

        internal IWorkspaceFileSystem FileSystem => _fileSystem;

        public Generator<TScope> StartScope<TScope>(TScope scope) where TScope : IGeneratorScope
        {
            return new Generator<TScope>(scope);
        }

        public Task InitializeAsync()
        {
            _fileSystem.EnsureRootDirectory();
            _fileSystem.CleanSourceDirectory();
            return Task.CompletedTask;
        }
    }
}
