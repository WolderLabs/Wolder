using DurableTask.Core;

namespace Wolder.Core.Pipeline;

public abstract class PipelineActivity<TInput, TResult> : TaskActivity<TInput, TResult>
{
    protected override TResult Execute(TaskContext context, TInput input)
    {
        // Do nothing
        return default(TResult);
    }

    protected override Task<TResult> ExecuteAsync(TaskContext context, TInput input)
    {
        return ExecuteAsync(new PipelineActionContext(), input);
    }

    protected abstract Task<TResult> ExecuteAsync(IPipelineActionContext context, TInput parameters);
}