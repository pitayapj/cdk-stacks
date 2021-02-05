import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as CiCd from '../lib/ci-cd-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new CiCd.CiCdStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
