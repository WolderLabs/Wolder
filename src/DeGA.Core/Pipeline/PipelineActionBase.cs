
namespace DeGA.Core.New
{
    public abstract class PipelineActionBase<TParameters> : IPipelineAction<TParameters>
        where TParameters : IActionDefinition
    {
        private TParameters? Parameters { get; set; }

        public void SetParameters(TParameters parameters)
        {
            if (Parameters is not null)
            {
                throw new InvalidOperationException("Parameters should only be set once for an action.");
            }
            Parameters = parameters;
        }

        public async Task ExecuteAsync(PipelineActionContext context)
        {
            if (Parameters == null)
            {
                throw new InvalidOperationException("Execute called before parameters set");
            }
            await ExecuteAsync(context, Parameters);
        }

        protected abstract Task ExecuteAsync(PipelineActionContext context, TParameters parameters);
    }
}
