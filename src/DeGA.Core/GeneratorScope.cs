namespace DeGA.Core
{
    public class Generator<TScope> where TScope : IGeneratorScope
    {
        private readonly TScope scope;

        //private readonly List<ILayerAction> _actions = new();
        //private readonly LayerActionFactory _layerActionFactory;
        //private readonly IWorkspaceFileSystem _workspaceFileSystem;

        //internal Generator(TScope scope, LayerActionFactory layerActionFactory, IWorkspaceFileSystem workspaceFileSystem)
        //{
        //    _layerActionFactory = layerActionFactory;
        //    _workspaceFileSystem = workspaceFileSystem;
        //}

        internal Generator(TScope scope)
        {
            this.scope = scope;
        }

        //internal IReadOnlyList<ILayerAction> Actions => _actions.AsReadOnly();

        //public Generator<TScope> AddAction<TAction, TOption>(TOption option)
        //    where TAction : ILayerAction<TOption>
        //    where TOption : notnull
        //{
        //    var action = _layerActionFactory.Create<TAction, TOption>(option);
        //    _actions.Add(action);
        //    return this;
        //}

        public Generator<TScope> Generate(string layerName, Action<TScope> layerAction)
        {
            return this;
        }

        public Generator<TScope> Generate<TOutput>(string layerName, Func<TScope, TOutput> layer)
        {
            return this;
        }

        //public async Task<string> WriteFileAsync(string relativePath, string text)
        //{
        //    return await _workspaceFileSystem.WriteFileAsync(relativePath, text);
        //}

        //public string GetAbsolutePath(string relativePath)
        //{
        //    return _workspaceFileSystem.GetAbsolutePath(relativePath);
        //}
    }
}