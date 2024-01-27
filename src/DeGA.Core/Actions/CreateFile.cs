using DeGA.Core.New;

namespace DeGA.Core.Actions
{
    public class CreateFile : PipelineActionBase<CreateFileParameters>
    {
        protected override async Task ExecuteAsync(
            PipelineActionContext context, CreateFileParameters parameters)
        {
            await context.WriteFileAsync(parameters.Path, parameters.Content);
        }
    }
}
