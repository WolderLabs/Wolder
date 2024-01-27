namespace DeGA.Core.New
{
    public interface IPipelineAction<TParameters> : IPipelineAction
        where TParameters : IActionInputParameters
    {
        void SetParameters(TParameters parameters);
    }

    public interface IPipelineAction
    {
        Task ExecuteAsync(PipelineActionContext context);
    }
}