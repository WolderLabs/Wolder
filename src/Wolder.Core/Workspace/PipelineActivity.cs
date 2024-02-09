
namespace Wolder.Core.Workspace;

public abstract class PipelineActivity<TInput, TResult>
{
    protected abstract Task<TResult> ExecuteAsync(
        IPipelineActionContext context, TInput parameters);
}