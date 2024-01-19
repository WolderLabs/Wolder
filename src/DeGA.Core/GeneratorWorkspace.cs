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

        public GeneratorScope<TScope> StartScope<TScope>(TScope scope)
        {
            return new GeneratorScope<TScope>(scope, _layerActionFactory, _fileSystem);
        }

        public async Task BuildAsync()
        {
            _fileSystem.EnsureRootDirectory();
            //foreach (var layer in _layers)
            //{
            //    foreach (var action in layer.Actions)
            //    {
            //        await action.InvokeAsync(layer);
            //    }
            //}
        }
    }
}
